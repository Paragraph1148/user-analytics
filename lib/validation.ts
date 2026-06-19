// Server-side validation for incoming events. We never trust the client: every event
// is normalized into a known shape, unknown fields are dropped, sizes are bounded, and
// anything that fails validation is rejected (not coerced into garbage). The server
// assigns `ts` and derives `path` here so neither can be spoofed.

import { EVENT_TYPES, type AnalyticsEvent, type EventType } from "./types";

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Shared session-id check, reused by read routes to reject malformed ids early. */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}
const MAX_COORD = 100_000; // generous upper bound for page coords / viewport
const MAX_STRING = 2_048; // url / referrer cap
const MAX_META_KEYS = 32;
const MAX_META_STRING = 512;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Finite number within [0, MAX_COORD], else undefined. */
function coord(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_COORD
    ? v
    : undefined;
}

/**
 * Keep `meta` bounded and non-identifying: primitives only, one level of nesting,
 * capped key count and string length. Anything richer is dropped rather than stored.
 */
function sanitizeMeta(v: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const [k, val] of Object.entries(v)) {
    if (keys >= MAX_META_KEYS) break;
    const clean = sanitizeValue(val);
    if (clean !== undefined) {
      out[k] = clean;
      keys++;
    }
  }
  return keys > 0 ? out : undefined;
}

function sanitizeValue(v: unknown): unknown {
  if (typeof v === "string") return v.slice(0, MAX_META_STRING);
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean" || v === null) return v;
  // one level of nesting for small primitive records (e.g. { tag, role })
  if (isPlainObject(v)) {
    const nested: Record<string, unknown> = {};
    let keys = 0;
    for (const [k, val] of Object.entries(v)) {
      if (keys >= MAX_META_KEYS) break;
      if (typeof val === "string") nested[k] = val.slice(0, MAX_META_STRING);
      else if (typeof val === "number" && Number.isFinite(val)) nested[k] = val;
      else if (typeof val === "boolean" || val === null) nested[k] = val;
      else continue;
      keys++;
    }
    return keys > 0 ? nested : undefined;
  }
  return undefined;
}

/**
 * Normalize one raw event into a stored AnalyticsEvent, or return null if invalid.
 * `ts` is server-assigned; `path` is derived from `url`.
 */
export function normalizeEvent(raw: unknown, now: Date = new Date()): AnalyticsEvent | null {
  if (!isPlainObject(raw)) return null;

  const sessionId = raw.sessionId;
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return null;

  if (typeof raw.type !== "string" || !EVENT_TYPES.includes(raw.type as EventType)) {
    return null;
  }
  const type = raw.type as EventType;

  if (typeof raw.url !== "string" || raw.url.length > MAX_STRING) return null;
  let path: string;
  try {
    const parsed = new URL(raw.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    path = parsed.pathname;
  } catch {
    return null;
  }

  const event: AnalyticsEvent = {
    sessionId,
    type,
    url: raw.url,
    path,
    ts: now,
  };

  const x = coord(raw.x);
  const y = coord(raw.y);
  if (x !== undefined) event.x = x;
  if (y !== undefined) event.y = y;

  const vpW = coord(raw.vpW);
  const vpH = coord(raw.vpH);
  if (vpW !== undefined) event.vpW = vpW;
  if (vpH !== undefined) event.vpH = vpH;

  if (typeof raw.referrer === "string" && raw.referrer.length <= MAX_STRING) {
    event.referrer = raw.referrer;
  }

  const meta = sanitizeMeta(raw.meta);
  if (meta) event.meta = meta;

  return event;
}

/**
 * Normalize a request body that is either a single event or an array (batch).
 * Returns the valid events plus how many were rejected. Returns null only when the
 * body is structurally unusable (not an object or array).
 */
export function normalizeBody(
  body: unknown,
  now: Date = new Date(),
): { events: AnalyticsEvent[]; rejected: number } | null {
  const raw = Array.isArray(body) ? body : isPlainObject(body) ? [body] : null;
  if (raw === null) return null;

  const events: AnalyticsEvent[] = [];
  let rejected = 0;
  for (const item of raw) {
    const ev = normalizeEvent(item, now);
    if (ev) events.push(ev);
    else rejected++;
  }
  return { events, rejected };
}
