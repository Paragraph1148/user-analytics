// Shared types for the analytics pipeline. The `events` collection is the single
// source of truth; sessions are derived from it via aggregation (see lib/events.ts).

export const EVENT_TYPES = [
  "page_view",
  "click",
  "rage_click",
  "dead_click",
  "scroll",
  "page_exit", // carries time-on-page (meta.dwellMs) + final scroll depth (meta.maxDepthPct)
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// ---- Read-side DTOs (what the dashboard consumes; dates serialized as ISO strings) ----

/** One row in the sessions list, derived from the events collection by aggregation. */
export interface SessionSummary {
  sessionId: string;
  events: number;
  pageViews: number;
  clicks: number;
  rageClicks: number;
  deadClicks: number;
  firstSeen: string;
  lastSeen: string;
  durationMs: number;
  entryPath: string;
  lastPath: string;
  geo?: { country?: string; region?: string };
  consentTier?: string;
  device?: string; // short label to tell sessions apart (e.g. "Android", "Chrome · macOS")
}

/** One event in a session's ordered journey. */
export interface JourneyEvent {
  type: EventType;
  ts: string;
  url: string;
  path: string;
  x?: number;
  y?: number;
  vpW?: number;
  vpH?: number;
  meta?: Record<string, unknown>;
}

/** A single point for the heatmap, normalized client-side against vpW/vpH. */
export interface HeatmapPoint {
  x: number;
  y: number;
  vpW: number;
  vpH: number;
  type: EventType;
}

/** A page that has click data, for the heatmap page selector. */
export interface HeatmapPathInfo {
  path: string;
  clicks: number;
}

/** A clicked element, grouped for the "most-clicked elements" report. */
export interface TopElement {
  tag: string;
  label: string;
  clicks: number;
}

/** One scroll-depth milestone and how many sessions reached it. */
export interface ScrollBucket {
  depthPct: number;
  sessions: number;
}

/**
 * A single analytics event as stored in MongoDB. `ts` is always assigned by the
 * server on ingest — we never trust the client clock. No field here is allowed to
 * carry PII: clicks are coordinates + element type, nothing more.
 */
export interface AnalyticsEvent {
  sessionId: string; // opaque first-party id
  type: EventType;
  url: string; // full URL
  path: string; // pathname only — indexed for heatmap-by-page
  ts: Date; // server-assigned
  x?: number; // page-relative click coords
  y?: number;
  vpW?: number; // viewport size, so the heatmap can normalize across screens
  vpH?: number;
  referrer?: string;
  meta?: Record<string, unknown>; // bounded, non-identifying (tag/role, scroll %, dwell ms)
}

/**
 * The shape clients send to /api/collect. `ts` and `path` are intentionally absent —
 * the server assigns `ts` and derives `path` from `url`.
 */
export type IncomingEvent = Omit<AnalyticsEvent, "ts" | "path">;
