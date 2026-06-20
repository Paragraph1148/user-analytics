// POST /api/collect — ingest endpoint for the tracker.
//
// Accepts a single event object or an array (batch). sendBeacon often sends the body
// as text/plain (or a Blob), so we read raw text and parse JSON ourselves rather than
// relying on the Content-Type. The server assigns `ts` and derives `path` during
// validation; invalid events are dropped, not fataled. The response body is only for
// the fetch path and tests — sendBeacon ignores it.

import { NextResponse } from "next/server";
import { normalizeBody } from "@/lib/validation";
import { ensureIndexes, insertEvents } from "@/lib/events";
import { CONSENT_COOKIE, cookieFromHeader, isAnalyticsAllowed, parse } from "@/lib/consent";

// This route hits the database, so it must run on the Node.js runtime and never be
// statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // Defense-in-depth for the privacy guarantee: browsers send these headers on every
  // request when the user enables DNT/GPC, so we honor them server-side even if a page
  // embeds the tracker without the client-side guard. Drop the body without storing.
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") {
    return NextResponse.json({ accepted: 0, rejected: 0, skipped: "dnt" }, { status: 202 });
  }

  // Consent enforcement: the first-party cf_consent cookie is sent same-origin with every
  // collect request. Without analytics consent we store nothing — the authoritative check,
  // independent of what the client claims in the body.
  const consent = parse(cookieFromHeader(req.headers.get("cookie"), CONSENT_COOKIE));
  if (!isAnalyticsAllowed(consent)) {
    return NextResponse.json({ accepted: 0, rejected: 0, skipped: "consent" }, { status: 202 });
  }

  let parsed: unknown;
  try {
    const text = await req.text();
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const result = normalizeBody(parsed);
  if (result === null) {
    return NextResponse.json(
      { error: "Body must be an event object or an array of events." },
      { status: 400 },
    );
  }

  try {
    await ensureIndexes();
    const accepted = await insertEvents(result.events);
    return NextResponse.json(
      { accepted, rejected: result.rejected },
      { status: 202 },
    );
  } catch {
    // Don't leak internals to the tracker; the client will retry from its queue.
    return NextResponse.json({ error: "Could not store events." }, { status: 503 });
  }
}
