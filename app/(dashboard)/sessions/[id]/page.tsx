import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionEvents, getSessionHeatmapPoints } from "@/lib/events";
import { getSession } from "@/lib/sessions";
import type { JourneyEvent } from "@/lib/types";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import JourneyTimeline from "@/components/JourneyTimeline";
import Heatmap from "@/components/Heatmap";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Session ${id}` };
}

function summarize(events: JourneyEvent[], fallbackStart: string) {
  const exit = events.find((e) => e.type === "page_exit");
  const start = events.length ? new Date(events[0].ts).getTime() : 0;
  const end = events.length ? new Date(events[events.length - 1].ts).getTime() : 0;
  const dwellMs =
    exit && typeof exit.meta?.dwellMs === "number" ? exit.meta.dwellMs : end - start;
  const depths = events
    .filter((e) => e.type === "scroll" && typeof e.meta?.depthPct === "number")
    .map((e) => e.meta!.depthPct as number);
  if (exit && typeof exit.meta?.maxDepthPct === "number") depths.push(exit.meta.maxDepthPct);
  return {
    events: events.length,
    pages: new Set(events.filter((e) => e.type === "page_view").map((e) => e.path)).size,
    clicks: events.filter((e) => e.type === "click").length,
    rage: events.filter((e) => e.type === "rage_click").length,
    dead: events.filter((e) => e.type === "dead_click").length,
    startedAt: events.length ? events[0].ts : fallbackStart,
    dwellMs,
    maxDepth: depths.length ? Math.max(...depths) : 0,
  };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [events, session, heatPoints] = await Promise.all([
    getSessionEvents(id),
    getSession(id),
    getSessionHeatmapPoints(id),
  ]);
  if (events.length === 0 && !session) notFound();

  const s = summarize(events, session?.firstSeen?.toISOString() ?? new Date().toISOString());
  const coarse = session?.geo?.country
    ? session.geo.country + (session.geo.region ? `-${session.geo.region}` : "")
    : null;
  const location = session?.precise
    ? `${session.precise.lat}, ${session.precise.lng}`
    : (coarse ?? "Unknown");
  const device = session?.device;
  const deviceRows: Array<[string, string]> = device
    ? (
        [
          ["Browser", device.browser],
          ["Platform", [device.platform, device.platformVersion].filter(Boolean).join(" ")],
          ["Architecture", device.arch],
          ["Model", device.model],
          ["Mobile", device.mobile === undefined ? undefined : device.mobile ? "yes" : "no"],
          ["Screen", device.screen],
          ["CPU cores", device.cores?.toString()],
          ["Memory", device.memory ? `${device.memory} GB` : undefined],
          ["GPU", device.gpu],
          ["Network", device.network],
          ["Languages", device.languages],
          ["Time zone", device.timezone],
          ["Color scheme", device.colorScheme],
        ] as Array<[string, string | undefined]>
      ).filter((r): r is [string, string] => !!r[1])
    : [];
  const stats: Array<[string, string]> = [
    ["Started", formatDateTime(s.startedAt)],
    ["Time on page", formatDuration(s.dwellMs)],
    [session?.precise ? "Location (precise)" : "Location", location],
    ["Consent", session?.consent?.tier ?? "—"],
    ["Pages", formatNumber(s.pages)],
    ["Events", formatNumber(s.events)],
    ["Max scroll", `${s.maxDepth}%`],
    ["Clicks", formatNumber(s.clicks)],
    ["Rage", formatNumber(s.rage)],
    ["Dead", formatNumber(s.dead)],
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 rounded-sm text-sm text-body underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Sessions
      </Link>

      <header className="mt-4">
        <p className="font-mono text-xs uppercase tracking-wide text-mute">User journey</p>
        <h1
          translate="no"
          className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink break-all"
        >
          {id}
        </h1>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-canvas px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-wide text-mute">
              {label}
            </dt>
            <dd className="mt-1 tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {deviceRows.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-ink">
            Device{" "}
            <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
              consented
            </span>
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-xl border border-hairline bg-canvas p-4 sm:grid-cols-2">
            {deviceRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-sm">
                <dt className="text-mute">{label}</dt>
                <dd className="text-right font-mono text-[13px] text-ink" translate="no">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {heatPoints.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-medium text-ink">Where they clicked</h2>
          <p className="mb-3 text-xs text-mute">This visitor&apos;s own clicks, normalized to their viewport.</p>
          <Heatmap points={heatPoints} path={id} />
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-ink">Timeline</h2>
        {events.length > 0 ? (
          <JourneyTimeline events={events} />
        ) : (
          <p className="rounded-xl border border-dashed border-hairline-strong/60 bg-canvas-soft p-6 text-sm text-mute">
            No interaction events were recorded for this session (consent + device captured,
            but no events arrived — e.g. a very short visit).
          </p>
        )}
      </section>
    </main>
  );
}
