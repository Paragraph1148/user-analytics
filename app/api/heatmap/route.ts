// GET /api/heatmap
//   ?path=/foo  -> { path, points: HeatmapPoint[] } for that page
//   (no path)   -> { paths: HeatmapPathInfo[] } to populate the page selector

import { NextResponse } from "next/server";
import { getHeatmapPoints, listHeatmapPaths } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const path = new URL(req.url).searchParams.get("path");

  try {
    if (path === null) {
      return NextResponse.json({ paths: await listHeatmapPaths() });
    }
    return NextResponse.json({ path, points: await getHeatmapPoints(path) });
  } catch {
    return NextResponse.json({ error: "Could not load heatmap." }, { status: 503 });
  }
}
