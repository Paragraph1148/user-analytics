// GET /api/sessions — the sessions list, derived from `events` by aggregation.
// Optional ?limit (default 50, capped server-side).

import { NextResponse } from "next/server";
import { listSessions } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 50;

  try {
    const sessions = await listSessions(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: "Could not load sessions." }, { status: 503 });
  }
}
