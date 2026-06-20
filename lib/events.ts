// Data access for the `events` collection. This is the only place that touches the
// collection directly. Sessions are derived from events via aggregation (added in a
// later phase) — there is no second collection to keep in sync.

import type { Collection, Document } from "mongodb";
import { getDb } from "./db";
import type {
  AnalyticsEvent,
  EventType,
  HeatmapPathInfo,
  HeatmapPoint,
  JourneyEvent,
  ScrollBucket,
  SessionSummary,
  TopElement,
} from "./types";

const COLLECTION = "events";

// Read limits — generous for a take-home, bounded so one request can't pull the world.
const MAX_SESSIONS = 200;
const MAX_JOURNEY_EVENTS = 2000;
const MAX_HEATMAP_POINTS = 8000;

// Click-like events that carry coordinates and belong on the heatmap.
const POSITIONAL_TYPES: EventType[] = ["click", "rage_click", "dead_click"];

// Retention: raw events expire after this window (a MongoDB TTL index). Derived sessions
// and the consent-log audit trail are kept.
const RETENTION_DAYS = 90;

export async function eventsCollection(): Promise<Collection<AnalyticsEvent>> {
  const db = await getDb();
  return db.collection<AnalyticsEvent>(COLLECTION);
}

// Insert validated events. Returns the number inserted. `ordered: false` so one bad
// document can't abort the rest of a batch.
export async function insertEvents(events: AnalyticsEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const col = await eventsCollection();
  const res = await col.insertMany(events, { ordered: false });
  return res.insertedCount;
}

// Index creation is idempotent, so calling this on startup (or first ingest) is safe.
// Indexes mirror the read paths (per-session journey, heatmap-by-page) plus a TTL index on
// `ts` that enforces retention and doubles as the recent-first sort index.
let indexesEnsured: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      const col = await eventsCollection();
      await col.createIndexes([
        { key: { sessionId: 1, ts: 1 }, name: "session_journey" },
        { key: { path: 1, type: 1 }, name: "heatmap_by_page" },
        { key: { ts: 1 }, name: "ts_ttl", expireAfterSeconds: RETENTION_DAYS * 86400 },
      ]);
    })().catch((err) => {
      // Reset so a transient failure can be retried on the next request.
      indexesEnsured = null;
      throw err;
    });
  }
  return indexesEnsured;
}

// ---- Sessions list -----------------------------------------------------------------

const countType = (t: string): Document => ({ $sum: { $cond: [{ $eq: ["$type", t] }, 1, 0] } });

/**
 * Sessions list driven by the `sessions` collection (the authoritative record of who
 * visited, incl. consent + geo), enriched with event-derived stats via a lookup. Driving
 * from `sessions` means sessions whose events never arrived (e.g. a lost beacon) still
 * appear, instead of vanishing. Pure (no I/O) so it's unit-testable. Runs on `sessions`.
 */
export function sessionsPipeline(limit: number): Document[] {
  return [
    { $sort: { lastSeen: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "events",
        let: { sid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$sessionId", "$$sid"] } } },
          {
            $group: {
              _id: null,
              events: { $sum: 1 },
              firstSeen: { $min: "$ts" },
              lastSeen: { $max: "$ts" },
              pageViews: countType("page_view"),
              clicks: countType("click"),
              rageClicks: countType("rage_click"),
              deadClicks: countType("dead_click"),
              // ts ties (same batch) broken by _id = enqueue order, for a stable entry/exit.
              entryPath: { $top: { sortBy: { ts: 1, _id: 1 }, output: "$path" } },
              lastPath: { $bottom: { sortBy: { ts: 1, _id: 1 }, output: "$path" } },
            },
          },
        ],
        as: "stats",
      },
    },
  ];
}

/** Map a session doc (+ looked-up event stats) into the API's SessionSummary shape. */
export function toSessionSummary(doc: Document): SessionSummary {
  const st = (Array.isArray(doc.stats) ? doc.stats[0] : undefined) ?? {};
  const first = (st.firstSeen as Date) ?? (doc.firstSeen as Date);
  const last = (st.lastSeen as Date) ?? (doc.lastSeen as Date);
  const summary: SessionSummary = {
    sessionId: doc._id as string,
    events: (st.events as number) ?? 0,
    pageViews: (st.pageViews as number) ?? 0,
    clicks: (st.clicks as number) ?? 0,
    rageClicks: (st.rageClicks as number) ?? 0,
    deadClicks: (st.deadClicks as number) ?? 0,
    firstSeen: first.toISOString(),
    lastSeen: last.toISOString(),
    durationMs: last.getTime() - first.getTime(),
    entryPath: (st.entryPath as string) ?? "—",
    lastPath: (st.lastPath as string) ?? "—",
  };
  if (doc.geo) summary.geo = { country: doc.geo.country, region: doc.geo.region };
  if (doc.consent?.tier) summary.consentTier = doc.consent.tier;
  return summary;
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const capped = Math.min(Math.max(limit, 1), MAX_SESSIONS);
  const db = await getDb();
  const docs = await db.collection("sessions").aggregate(sessionsPipeline(capped)).toArray();
  return docs.map(toSessionSummary);
}

// ---- One session's ordered journey -------------------------------------------------

export async function getSessionEvents(sessionId: string): Promise<JourneyEvent[]> {
  const col = await eventsCollection();
  const docs = await col
    .find({ sessionId })
    // ts is the server receive time; _id breaks within-batch ties in enqueue order.
    .sort({ ts: 1, _id: 1 })
    .limit(MAX_JOURNEY_EVENTS)
    .toArray();

  return docs.map((d) => {
    const ev: JourneyEvent = {
      type: d.type,
      ts: d.ts.toISOString(),
      url: d.url,
      path: d.path,
    };
    if (d.x !== undefined) ev.x = d.x;
    if (d.y !== undefined) ev.y = d.y;
    if (d.vpW !== undefined) ev.vpW = d.vpW;
    if (d.vpH !== undefined) ev.vpH = d.vpH;
    if (d.meta !== undefined) ev.meta = d.meta;
    return ev;
  });
}

// ---- Heatmap -----------------------------------------------------------------------

/** Click-like points for one page, with the coords the heatmap needs to normalize. */
export async function getHeatmapPoints(path: string): Promise<HeatmapPoint[]> {
  const col = await eventsCollection();
  const docs = await col
    .find(
      { path, type: { $in: POSITIONAL_TYPES }, x: { $exists: true }, y: { $exists: true } },
      { projection: { _id: 0, x: 1, y: 1, vpW: 1, vpH: 1, type: 1 } },
    )
    .limit(MAX_HEATMAP_POINTS)
    .toArray();

  // Only points with a viewport can be normalized across screens.
  return docs
    .filter((d) => typeof d.vpW === "number" && typeof d.vpH === "number")
    .map((d) => ({
      x: d.x as number,
      y: d.y as number,
      vpW: d.vpW as number,
      vpH: d.vpH as number,
      type: d.type,
    }));
}

/** Pages that have click data, most-clicked first — powers the heatmap page selector. */
export async function listHeatmapPaths(): Promise<HeatmapPathInfo[]> {
  const col = await eventsCollection();
  const docs = await col
    .aggregate([
      { $match: { type: { $in: POSITIONAL_TYPES } } },
      { $group: { _id: "$path", clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 100 },
    ])
    .toArray();
  return docs.map((d) => ({ path: d._id as string, clicks: d.clicks as number }));
}

// ---- Element-level + scroll analytics ----------------------------------------------

/** Group plain clicks (not rage/dead, to avoid double counting) by element for one page. */
export function topElementsPipeline(path: string, limit: number): Document[] {
  return [
    { $match: { path, type: "click" } },
    {
      $group: {
        _id: { tag: { $ifNull: ["$meta.tag", ""] }, label: { $ifNull: ["$meta.label", ""] } },
        clicks: { $sum: 1 },
      },
    },
    { $sort: { clicks: -1 } },
    { $limit: limit },
  ];
}

export async function getTopElements(path: string, limit = 20): Promise<TopElement[]> {
  const col = await eventsCollection();
  const docs = await col.aggregate(topElementsPipeline(path, limit)).toArray();
  return docs.map((d) => ({
    tag: (d._id.tag as string) || "",
    label: (d._id.label as string) || "",
    clicks: d.clicks as number,
  }));
}

/** Distinct sessions reaching each scroll-depth milestone on one page. */
export function scrollDistributionPipeline(path: string): Document[] {
  return [
    { $match: { path, type: "scroll" } },
    { $group: { _id: "$meta.depthPct", sessions: { $addToSet: "$sessionId" } } },
    { $project: { _id: 0, depthPct: "$_id", sessions: { $size: "$sessions" } } },
    { $sort: { depthPct: 1 } },
  ];
}

export async function getScrollDistribution(path: string): Promise<ScrollBucket[]> {
  const col = await eventsCollection();
  const docs = await col.aggregate(scrollDistributionPipeline(path)).toArray();
  return docs
    .filter((d) => typeof d.depthPct === "number")
    .map((d) => ({ depthPct: d.depthPct as number, sessions: d.sessions as number }));
}
