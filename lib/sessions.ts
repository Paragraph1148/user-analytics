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

export interface SessionDoc {
  _id: string; // sessionId
  firstSeen: Date;
  lastSeen: Date;
  consent: SessionConsent;
  geo?: SessionGeo;
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

export async function getSession(sessionId: string): Promise<SessionDoc | null> {
  const db = await getDb();
  return db.collection<SessionDoc>("sessions").findOne({ _id: sessionId });
}
