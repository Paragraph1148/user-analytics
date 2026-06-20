// The `sessions` collection holds mutable/stable-per-session state that doesn't belong on
// every event: the current consent, coarse geo, and first/last seen. It's upserted on each
// ingest. Events remain the append-only source of truth for behavior.

import { getDb } from "./db";
import type { Geo } from "./geo";
import type { Purposes, Tier } from "./consent";

export interface SessionConsent {
  tier: Tier;
  version: number;
  purposes: Purposes;
}

export interface SessionGeo extends Geo {
  source: "ip" | "precise";
}

/** High-entropy device profile — only collected under the device_profiling purpose. These
 *  are device/browser characteristics (the kind /research demonstrates as fingerprinting),
 *  here stored as first-party data with explicit consent — never hashed cross-site or
 *  respawned. */
export interface DeviceProfile {
  ua?: string;
  platform?: string;
  platformVersion?: string;
  arch?: string;
  model?: string;
  browser?: string;
  mobile?: boolean;
  screen?: string;
  cores?: number;
  memory?: number;
  touch?: number;
  languages?: string;
  timezone?: string;
  gpu?: string;
  network?: string;
  colorScheme?: string;
  reducedMotion?: boolean;
}

export interface SessionDoc {
  _id: string; // sessionId
  firstSeen: Date;
  lastSeen: Date;
  consent: SessionConsent;
  geo?: SessionGeo; // coarse, from IP
  precise?: { lat: number; lng: number }; // from navigator.geolocation (precise_location)
  device?: DeviceProfile; // from device_profiling
}

const DEVICE_STR_KEYS: Array<keyof DeviceProfile> = [
  "ua", "platform", "platformVersion", "arch", "model", "browser",
  "screen", "languages", "timezone", "gpu", "network", "colorScheme",
];
const DEVICE_NUM_KEYS: Array<keyof DeviceProfile> = ["cores", "memory", "touch"];
const DEVICE_BOOL_KEYS: Array<keyof DeviceProfile> = ["mobile", "reducedMotion"];

/** Keep only known device fields, bound strings, validate numbers — never trust the client. */
export function sanitizeDevice(raw: unknown): DeviceProfile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const k of DEVICE_STR_KEYS) {
    if (typeof r[k] === "string") out[k] = (r[k] as string).slice(0, 256);
  }
  for (const k of DEVICE_NUM_KEYS) {
    if (typeof r[k] === "number" && Number.isFinite(r[k])) out[k] = r[k] as number;
  }
  for (const k of DEVICE_BOOL_KEYS) {
    if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
  }
  return Object.keys(out).length ? (out as DeviceProfile) : null;
}

/** Round coordinates to ~110m precision (data minimization), validating the input. */
export function roundPrecise(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { lat?: unknown; lng?: unknown };
  if (typeof r.lat !== "number" || typeof r.lng !== "number") return null;
  if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return null;
  if (Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180) return null;
  return { lat: Math.round(r.lat * 1000) / 1000, lng: Math.round(r.lng * 1000) / 1000 };
}

/** Upsert session-level state. Best-effort enrichment — callers don't fail ingest on error.
 *  Geo is only written when resolved, so a later request with no geo won't erase it. */
export async function upsertSession(
  sessionId: string,
  data: { consent: SessionConsent; geo: Geo | null; now: Date },
): Promise<void> {
  const db = await getDb();
  const set: Record<string, unknown> = { lastSeen: data.now, consent: data.consent };
  if (data.geo) set.geo = { ...data.geo, source: "ip" };
  await db.collection<SessionDoc>("sessions").updateOne(
    { _id: sessionId },
    { $set: set, $setOnInsert: { firstSeen: data.now } },
    { upsert: true },
  );
}

/** Attach Allow-all-tier attributes (device profile, precise location) to a session.
 *  Only the fields passed are written; the session is normally created already by ingest. */
export async function updateSessionAttributes(
  sessionId: string,
  data: {
    device?: DeviceProfile | null;
    precise?: { lat: number; lng: number } | null;
    consent: SessionConsent;
    now: Date;
  },
): Promise<boolean> {
  const set: Record<string, unknown> = {};
  if (data.device) set.device = data.device;
  if (data.precise) set.precise = data.precise;
  if (Object.keys(set).length === 0) return false;
  set.lastSeen = data.now;

  const db = await getDb();
  await db.collection<SessionDoc>("sessions").updateOne(
    { _id: sessionId },
    { $set: set, $setOnInsert: { firstSeen: data.now, consent: data.consent } },
    { upsert: true },
  );
  return true;
}

export async function getSession(sessionId: string): Promise<SessionDoc | null> {
  const db = await getDb();
  return db.collection<SessionDoc>("sessions").findOne({ _id: sessionId });
}

/** Right to erasure: remove everything tied to a session — events, the session record, and
 *  its consent-log entries. Returns how many documents were deleted from each. */
export async function deleteSessionData(
  sessionId: string,
): Promise<{ events: number; sessions: number; consentLog: number }> {
  const db = await getDb();
  const [events, sessions, consentLog] = await Promise.all([
    db.collection("events").deleteMany({ sessionId }),
    db.collection<SessionDoc>("sessions").deleteMany({ _id: sessionId }),
    db.collection("consent_log").deleteMany({ sessionId }),
  ]);
  return {
    events: events.deletedCount,
    sessions: sessions.deletedCount,
    consentLog: consentLog.deletedCount,
  };
}
