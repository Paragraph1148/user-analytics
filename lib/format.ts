// Locale-aware formatting via Intl (never hardcoded formats). Used across the dashboard
// so dates, numbers, and durations read consistently.

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const number = new Intl.NumberFormat(undefined);

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatNumber(n: number): string {
  return number.format(n);
}

/** Compact human duration: "0s", "42s", "3m 20s", "1h 4m". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Milliseconds from a session's start, for a journey timeline ("+0.0s", "+12.4s"). */
export function formatOffset(ms: number): string {
  return `+${(ms / 1000).toFixed(1)}s`;
}
