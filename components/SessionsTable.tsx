import Link from "next/link";
import type { SessionSummary } from "@/lib/types";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";

function Num({ value, accent }: { value: number; accent?: "rage" | "dead" }) {
  const color =
    value > 0 && accent === "rage"
      ? "text-signal-rage"
      : value > 0 && accent === "dead"
        ? "text-signal-dead"
        : value > 0
          ? "text-ink"
          : "text-mute";
  return <span className={"tabular-nums " + color}>{formatNumber(value)}</span>;
}

export default function SessionsTable({ sessions }: { sessions: SessionSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-canvas">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline bg-canvas-soft text-left">
            <Th>Session</Th>
            <Th>Path</Th>
            <Th>Started</Th>
            <Th align="right">Duration</Th>
            <Th align="right">Events</Th>
            <Th align="right">Clicks</Th>
            <Th align="right">Rage</Th>
            <Th align="right">Dead</Th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
              key={s.sessionId}
              className="border-b border-hairline last:border-0 transition-colors hover:bg-canvas-soft"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/sessions/${s.sessionId}`}
                  translate="no"
                  className="rounded-sm font-mono text-[13px] text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {s.sessionId}
                </Link>
              </td>
              <td className="px-4 py-3 text-body">
                <span className="font-mono text-[13px]">{s.entryPath}</span>
                {s.lastPath !== s.entryPath && (
                  <span className="font-mono text-[13px] text-mute"> → {s.lastPath}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-body">
                {formatDateTime(s.firstSeen)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-body">
                {formatDuration(s.durationMs)}
              </td>
              <td className="px-4 py-3 text-right">
                <Num value={s.events} />
              </td>
              <td className="px-4 py-3 text-right">
                <Num value={s.clicks} />
              </td>
              <td className="px-4 py-3 text-right">
                <Num value={s.rageClicks} accent="rage" />
              </td>
              <td className="px-4 py-3 text-right">
                <Num value={s.deadClicks} accent="dead" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={
        "px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-mute " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}
