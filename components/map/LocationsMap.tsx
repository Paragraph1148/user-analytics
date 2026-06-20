"use client";

import dynamic from "next/dynamic";
import type { Bubble } from "./LeafletMap";

// Leaflet needs the DOM, so load the real map client-side only (no SSR). This wrapper is a
// Client Component, which is where next/dynamic's ssr:false is allowed.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-xl border border-hairline bg-canvas-soft-2" />,
});

export default function LocationsMap(props: { bubbles: Bubble[]; points: Array<[number, number]> }) {
  return <LeafletMap {...props} />;
}
