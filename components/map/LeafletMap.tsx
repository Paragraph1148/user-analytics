"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

export interface Bubble {
  lat: number;
  lng: number;
  label: string;
  sessions: number;
}

// OSM base map with two layers: country-count bubbles (from coarse IP geo, so it's never
// empty) and a heat layer over precise points (consented precise_location).
export default function LeafletMap({
  bubbles,
  points,
}: {
  bubbles: Bubble[];
  points: Array<[number, number]>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { worldCopyJump: true, minZoom: 1 }).setView([20, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const maxSessions = bubbles.reduce((m, b) => Math.max(m, b.sessions), 1);
    for (const b of bubbles) {
      L.circleMarker([b.lat, b.lng], {
        radius: 6 + (b.sessions / maxSessions) * 18,
        color: "#0070f3",
        weight: 1,
        fillColor: "#0070f3",
        fillOpacity: 0.35,
      })
        .bindTooltip(`${b.label}: ${b.sessions}`)
        .addTo(map);
    }

    if (points.length > 0) {
      // leaflet.heat augments L at runtime; it has no bundled types.
      // @ts-expect-error heatLayer is added by the leaflet.heat plugin
      L.heatLayer(points, { radius: 25, blur: 18, minOpacity: 0.3 }).addTo(map);
    }

    return () => {
      map.remove();
    };
  }, [bubbles, points]);

  return (
    <div
      ref={ref}
      className="h-[420px] w-full overflow-hidden rounded-xl border border-hairline bg-canvas-soft-2"
    />
  );
}
