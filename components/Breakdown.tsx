import type { Breakdown as BreakdownItem } from "@/lib/sessions";
import { formatNumber } from "@/lib/format";

// A simple horizontal bar list (value · bar · count), used for the audience breakdowns.
export default function Breakdown({
  title,
  subtitle,
  items,
  mono,
}: {
  title: string;
  subtitle?: string;
  items: BreakdownItem[];
  mono?: boolean;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.sessions), 0);

  return (
    <section className="rounded-xl border border-hairline bg-canvas p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-mute">{subtitle}</p>}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-mute">No data yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.value} className="flex items-center gap-3">
              <span
                className={"w-32 shrink-0 truncate text-sm text-ink" + (mono ? " font-mono text-[13px]" : "")}
                title={item.value}
                translate="no"
              >
                {item.value}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-soft-2">
                <span
                  className="block h-full rounded-full bg-ink"
                  style={{ width: `${max ? (item.sessions / max) * 100 : 0}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-sm text-body">
                {formatNumber(item.sessions)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
