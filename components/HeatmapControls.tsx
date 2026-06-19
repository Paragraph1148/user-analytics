"use client";

import { useRouter } from "next/navigation";
import type { HeatmapPathInfo } from "@/lib/types";
import { formatNumber } from "@/lib/format";

// The selected page lives in the URL (?path=), so the view is shareable and the back
// button works.
export default function HeatmapControls({
  paths,
  selected,
}: {
  paths: HeatmapPathInfo[];
  selected: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="heatmap-path" className="text-sm text-body">
        Page
      </label>
      <select
        id="heatmap-path"
        value={selected}
        onChange={(e) => router.push(`/heatmap?path=${encodeURIComponent(e.target.value)}`)}
        className="rounded-md border border-hairline bg-canvas px-3 py-1.5 font-mono text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {paths.map((p) => (
          <option key={p.path} value={p.path}>
            {p.path} ({formatNumber(p.clicks)})
          </option>
        ))}
      </select>
    </div>
  );
}
