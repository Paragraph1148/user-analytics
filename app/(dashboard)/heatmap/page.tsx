import type { Metadata } from "next";
import { getHeatmapPoints, listHeatmapPaths } from "@/lib/events";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Heatmap from "@/components/Heatmap";
import HeatmapControls from "@/components/HeatmapControls";

export const metadata: Metadata = { title: "Heatmap" };
export const dynamic = "force-dynamic";

export default async function HeatmapPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const { path } = await searchParams;
  const paths = await listHeatmapPaths();

  if (paths.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <PageHeader eyebrow="Dashboard" title="Click heatmap" />
        <EmptyState
          title="No click data yet"
          description="The heatmap plots where people click on a page, normalized across screen sizes. Generate some clicks on the demo page to see it."
          actionHref="/demo"
          actionLabel="Open the demo"
        />
      </main>
    );
  }

  const selected = path && paths.some((p) => p.path === path) ? path : paths[0].path;
  const points = await getHeatmapPoints(selected);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Dashboard"
        title="Click heatmap"
        subtitle={`${formatNumber(points.length)} click points, normalized to each visitor's viewport.`}
        actions={<HeatmapControls paths={paths} selected={selected} />}
      />

      <Heatmap points={points} path={selected} />

      <div className="mt-4 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wide text-mute">Low</span>
        <div
          className="h-2 w-40 rounded-full"
          style={{
            background:
              "linear-gradient(to right, rgba(0,112,243,0.4), #50e3c2, #f5a623, #ee0000)",
          }}
        />
        <span className="font-mono text-[11px] uppercase tracking-wide text-mute">High</span>
        <span className="ml-auto font-mono text-xs text-mute" translate="no">
          {selected}
        </span>
      </div>
    </main>
  );
}
