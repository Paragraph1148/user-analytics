// Append-only record of consent decisions — the GDPR "record of consent." Separate from
// the events collection; one document per choice (grant / change / withdraw).

import { getDb } from "./db";
import type { Purposes, Tier } from "./consent";

export interface ConsentLogEntry {
  ts: Date;
  version: number;
  purposes: Purposes;
  tier: Tier;
  sessionId: string | null;
  source: string;
}

export async function logConsent(entry: ConsentLogEntry): Promise<void> {
  const db = await getDb();
  await db.collection<ConsentLogEntry>("consent_log").insertOne(entry);
}
