// POST /api/session — attach Allow-all-tier attributes to a session: a high-entropy device
// profile (device_profiling) and/or precise location (precise_location). Each field is
// enforced against its consent purpose server-side; anything not consented is dropped.

import { NextResponse } from "next/server";
import { CONSENT_COOKIE, cookieFromHeader, parse, tierOf } from "@/lib/consent";
import { isValidSessionId } from "@/lib/validation";
import { roundPrecise, sanitizeDevice, updateSessionAttributes } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") {
    return NextResponse.json({ skipped: "dnt" }, { status: 202 });
  }

  let body: { sessionId?: unknown; device?: unknown; precise?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !isValidSessionId(body.sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const consent = parse(cookieFromHeader(req.headers.get("cookie"), CONSENT_COOKIE));
  if (!consent || !consent.a) {
    return NextResponse.json({ skipped: "consent" }, { status: 202 });
  }

  // Per-purpose enforcement: device requires device_profiling (d), precise requires
  // precise_location (l). Drop whatever isn't consented.
  const device = consent.d ? sanitizeDevice(body.device) : null;
  const precise = consent.l ? roundPrecise(body.precise) : null;
  if (!device && !precise) {
    return NextResponse.json({ skipped: "nothing-permitted" }, { status: 202 });
  }

  try {
    const purposes = { a: consent.a, l: consent.l, d: consent.d };
    await updateSessionAttributes(body.sessionId, {
      device,
      precise,
      consent: { tier: tierOf(purposes), version: consent.v, purposes },
      now: new Date(),
    });
    return NextResponse.json({ ok: true, stored: { device: !!device, precise: !!precise } }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not update session." }, { status: 503 });
  }
}
