// GET /api/sessions/[id] — the ordered event journey for one session.

import { NextResponse } from "next/server";
import { getSessionEvents } from "@/lib/events";
import { isValidSessionId } from "@/lib/validation";

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
