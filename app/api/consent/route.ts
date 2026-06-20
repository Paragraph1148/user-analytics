// POST /api/consent — record a consent decision (the audit trail). The banner calls this
// whenever the user grants, changes, or withdraws consent.

import { NextResponse } from "next/server";
import { CONSENT_VERSION, cookieFromHeader, tierOf, type Purposes } from "@/lib/consent";
import { logConsent } from "@/lib/consent-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = (body ?? {}) as { purposes?: unknown };
  const p = raw.purposes as Partial<Purposes> | undefined;
  if (!p || !isBool(p.a) || !isBool(p.l) || !isBool(p.d)) {
    return NextResponse.json({ error: "Missing or invalid purposes." }, { status: 400 });
  }
  const purposes: Purposes = { a: p.a, l: p.l, d: p.d };

  // Associate with the session id if one exists yet (first-party cookie).
  const sessionId = cookieFromHeader(req.headers.get("cookie"), "cf_sid");

  try {
    await logConsent({
      ts: new Date(),
      version: CONSENT_VERSION,
      purposes,
      tier: tierOf(purposes),
      sessionId,
      source: "banner",
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not record consent." }, { status: 503 });
  }
}
