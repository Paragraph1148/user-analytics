import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionEvents } from "@/lib/events";
import type { JourneyEvent } from "@/lib/types";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import JourneyTimeline from "@/components/JourneyTimeline";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Session ${id}` };
}

function summarize(events: JourneyEvent[]) {
  const start = new Date(events[0].ts).getTime();
  const end = new Date(events[events.length - 1].ts).getTime();
  const exit = events.find((e) => e.type === "page_exit");
  const dwellMs =
    exit && typeof exit.meta?.dwellMs === "number" ? exit.meta.dwellMs : end - start;
  return {
    events: events.length,
    pages: new Set(events.filter((e) => e.type === "page_view").map((e) => e.path)).size,
    clicks: events.filter((e) => e.type === "click").length,
    rage: events.filter((e) => e.type === "rage_click").length,
    dead: events.filter((e) => e.type === "dead_click").length,
    startedAt: events[0].ts,
    dwellMs,
  };
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const events = await getSessionEvents(id);
  if (events.length === 0) notFound();

  const s = summarize(events);
  const stats: Array<[string, string]> = [
    ["Started", formatDateTime(s.startedAt)],
    ["Time on page", formatDuration(s.dwellMs)],
    ["Pages", formatNumber(s.pages)],
    ["Events", formatNumber(s.events)],
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

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-ink">Timeline</h2>
        <JourneyTimeline events={events} />
      </section>
    </main>
  );
}
