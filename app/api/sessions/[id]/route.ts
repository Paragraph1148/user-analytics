// GET /api/sessions/[id] — the ordered event journey for one session.
// DELETE /api/sessions/[id] — right to erasure (self-serve).

import { NextResponse } from "next/server";
import { getSessionEvents } from "@/lib/events";
import { deleteSessionData } from "@/lib/sessions";
import { isValidSessionId } from "@/lib/validation";
import { cookieFromHeader } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!isValidSessionId(id)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  try {
    const events = await getSessionEvents(id);
    if (events.length === 0) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ sessionId: id, events });
  } catch {
    return NextResponse.json({ error: "Could not load session." }, { status: 503 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!isValidSessionId(id)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  // Self-serve erasure: a visitor may delete only their own data, proven by the first-party
  // cf_sid cookie matching the requested session (no accounts needed).
  const sid = cookieFromHeader(req.headers.get("cookie"), "cf_sid");
  if (sid !== id) {
    return NextResponse.json(
      { error: "You can only delete your own session." },
      { status: 403 },
    );
  }

  try {
    const deleted = await deleteSessionData(id);
    return NextResponse.json({ ok: true, deleted });
  } catch {
    return NextResponse.json({ error: "Could not delete session." }, { status: 503 });
  }
}
