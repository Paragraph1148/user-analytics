import type { JourneyEvent } from "@/lib/types";
import { formatOffset } from "@/lib/format";
import SignalBadge from "./SignalBadge";

// A short, human description of what each event captured — coordinates, scroll depth,
// dwell time. Never any text the user typed.
function detail(ev: JourneyEvent): string | null {
  const meta = ev.meta ?? {};
  switch (ev.type) {
    case "click":
    case "rage_click":
    case "dead_click": {
      const tag = typeof meta.tag === "string" ? `<${meta.tag}>` : "element";
      return ev.x !== undefined && ev.y !== undefined
        ? `${tag} at ${ev.x}, ${ev.y}`
        : tag;
    }
    case "scroll":
      return typeof meta.depthPct === "number" ? `Reached ${meta.depthPct}% depth` : null;
    case "page_exit": {
      const parts: string[] = [];
      if (typeof meta.dwellMs === "number") parts.push(`${(meta.dwellMs / 1000).toFixed(1)}s on page`);
      if (typeof meta.maxDepthPct === "number") parts.push(`${meta.maxDepthPct}% max depth`);
      return parts.join(" · ") || null;
    }
    case "page_view":
      return typeof meta.referrer === "string" && meta.referrer
        ? `From ${meta.referrer}`
        : "Direct";
    default:
      return null;
  }
}

export default function JourneyTimeline({ events }: { events: JourneyEvent[] }) {
  const start = new Date(events[0].ts).getTime();

  return (
    <ol className="relative border-l border-hairline pl-6">
      {events.map((ev, i) => {
        const offset = new Date(ev.ts).getTime() - start;
        const d = detail(ev);
        return (
          <li key={i} className="relative pb-6 last:pb-0">
            <span
              aria-hidden
              className="absolute -left-[1.625rem] top-1.5 size-2.5 rounded-full border-2 border-canvas bg-hairline-strong"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <SignalBadge type={ev.type} />
              <span className="font-mono text-xs tabular-nums text-mute">
                {formatOffset(offset)}
              </span>
              <span className="font-mono text-[13px] text-body">{ev.path}</span>
            </div>
            {d && <p className="mt-1 text-sm text-body">{d}</p>}
          </li>
        );
      })}
    </ol>
  );
}
