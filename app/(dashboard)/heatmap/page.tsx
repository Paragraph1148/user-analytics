import type { Metadata } from "next";
import {
  getHeatmapPoints,
  getScrollDistribution,
  getTopElements,
  listHeatmapPaths,
} from "@/lib/events";
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
  const [points, elements, scroll] = await Promise.all([
    getHeatmapPoints(selected),
    getTopElements(selected),
    getScrollDistribution(selected),
  ]);
  const maxScrollSessions = scroll.reduce((m, b) => Math.max(m, b.sessions), 0);
  const maxElementClicks = elements.reduce((m, e) => Math.max(m, e.clicks), 0);

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

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        {/* Most-clicked elements */}
        <section>
          <h2 className="text-sm font-medium text-ink">Most-clicked elements</h2>
          <p className="mt-1 text-sm text-mute">What people click on this page, not just where.</p>
          {elements.length === 0 ? (
            <p className="mt-4 text-sm text-mute">No element data yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {elements.map((el, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-ink" title={el.label || el.tag}>
                    {el.label || <span className="text-mute">(unlabeled)</span>}
                    <span className="ml-1 font-mono text-[11px] text-mute" translate="no">
                      {el.tag}
                    </span>
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-soft-2">
                    <span
                      className="block h-full rounded-full bg-ink"
                      style={{ width: `${maxElementClicks ? (el.clicks / maxElementClicks) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-sm text-body">
                    {formatNumber(el.clicks)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Scroll depth distribution */}
        <section>
          <h2 className="text-sm font-medium text-ink">Scroll depth</h2>
          <p className="mt-1 text-sm text-mute">Sessions that reached each depth on this page.</p>
          {scroll.length === 0 ? (
            <p className="mt-4 text-sm text-mute">No scroll data yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {scroll.map((b) => (
                <li key={b.depthPct} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-right font-mono text-[13px] tabular-nums text-body">
                    {b.depthPct}%
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-soft-2">
                    <span
                      className="block h-full rounded-full bg-signal-cool"
                      style={{ width: `${maxScrollSessions ? (b.sessions / maxScrollSessions) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-sm text-body">
                    {formatNumber(b.sessions)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
