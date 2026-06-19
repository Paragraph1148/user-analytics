"use client";

import { useEffect, useRef } from "react";
import type { HeatmapPoint } from "@/lib/types";

// Brand-palette heat ramp (DESIGN.md): cool link-blue → cyan → amber → red. The gradient
// IS the legend, so the legend bar below reuses the same stops.
const RAMP: Array<[number, string]> = [
  [0.0, "rgba(0,112,243,0)"],
  [0.2, "rgba(0,112,243,0.7)"],
  [0.45, "#50e3c2"],
  [0.65, "#f5a623"],
  [0.85, "#ee0000"],
  [1.0, "#ee0000"],
];

const ASPECT = 10 / 16; // plotting surface stands in for a landscape viewport
const CENTER_ALPHA = 0.4;

// A 256-entry color lookup built once from the ramp; index by accumulated density.
function buildPalette(): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [stop, color] of RAMP) grad.addColorStop(stop, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

export default function Heatmap({ points, path }: { points: HeatmapPoint[]; path: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<Uint8ClampedArray | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    if (!paletteRef.current) paletteRef.current = buildPalette();
    const palette = paletteRef.current;

    function draw() {
      const cssW = wrap!.clientWidth;
      // The ResizeObserver can fire before layout or while the element is hidden, giving a
      // zero width. Bail then — sizing the canvas to 0 would make getImageData throw. A
      // later resize with a real width redraws.
      if (cssW <= 0) return;
      const cssH = Math.round(cssW * ASPECT);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = cssW * dpr;
      canvas!.height = cssH * dpr;
      canvas!.style.height = `${cssH}px`;

      const ctx = canvas!.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (points.length === 0) return;

      // 1) Accumulate density as a grayscale alpha field — overlapping translucent
      //    blobs build up where clicks cluster.
      const radius = Math.max(cssW * 0.035, 18);
      ctx.globalCompositeOperation = "source-over";
      for (const p of points) {
        const fx = Math.min(Math.max(p.x / p.vpW, 0), 1);
        const fy = Math.min(Math.max(p.y / p.vpH, 0), 1);
        const x = fx * cssW;
        const y = fy * cssH;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `rgba(0,0,0,${CENTER_ALPHA})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }

      // 2) Recolor each pixel by its accumulated density via the palette LUT.
      const img = ctx.getImageData(0, 0, canvas!.width, canvas!.height);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        data[i] = palette[a * 4];
        data[i + 1] = palette[a * 4 + 1];
        data[i + 2] = palette[a * 4 + 2];
        data[i + 3] = Math.min(255, a + 40); // floor opacity so sparse clicks still read
      }
      ctx.putImageData(img, 0, 0);
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points, path]);

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-xl border border-hairline bg-canvas-soft-2"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Click density heatmap for ${path}, based on ${points.length} points`}
        className="block w-full"
      />
    </div>
  );
}
