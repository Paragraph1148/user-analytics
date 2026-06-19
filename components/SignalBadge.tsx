import type { EventType } from "@/lib/types";

// One quiet, consistent visual language for event types. Color is reserved for the two
// frustration signals (rage/dead); everything else stays monochrome.
const STYLES: Record<EventType, { label: string; className: string }> = {
  page_view: { label: "Page view", className: "bg-canvas-soft-2 text-body" },
  click: { label: "Click", className: "bg-canvas-soft-2 text-body" },
  scroll: { label: "Scroll", className: "bg-canvas-soft-2 text-body" },
  page_exit: { label: "Page exit", className: "bg-canvas-soft-2 text-body" },
  rage_click: {
    label: "Rage click",
    className: "bg-signal-rage/10 text-signal-rage",
  },
  dead_click: {
    label: "Dead click",
    className: "bg-signal-dead/15 text-signal-dead",
  },
};

export default function SignalBadge({ type }: { type: EventType }) {
  const style = STYLES[type] ?? STYLES.click;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium " +
        style.className
      }
    >
      {style.label}
    </span>
  );
}
