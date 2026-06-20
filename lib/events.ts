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
  SessionSummary,
} from "./types";

const COLLECTION = "events";

// Read limits — generous for a take-home, bounded so one request can't pull the world.
const MAX_SESSIONS = 200;
const MAX_JOURNEY_EVENTS = 2000;
const MAX_HEATMAP_POINTS = 8000;

// Click-like events that carry coordinates and belong on the heatmap.
const POSITIONAL_TYPES: EventType[] = ["click", "rage_click", "dead_click"];

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
// Indexes mirror the three read paths: per-session journey, heatmap-by-page, recent
// sessions list.
let indexesEnsured: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      const col = await eventsCollection();
      await col.createIndexes([
        { key: { sessionId: 1, ts: 1 }, name: "session_journey" },
        { key: { path: 1, type: 1 }, name: "heatmap_by_page" },
        { key: { ts: -1 }, name: "recent" },
      ]);
    })().catch((err) => {
      // Reset so a transient failure can be retried on the next request.
      indexesEnsured = null;
      throw err;
    });
  }
  return indexesEnsured;
}

// ---- Sessions list (derived) -------------------------------------------------------

const countType = (t: string): Document => ({ $sum: { $cond: [{ $eq: ["$type", t] }, 1, 0] } });

/**
 * Aggregation that derives the sessions list from `events`. Pure (no I/O) so it can be
 * unit-tested. $top/$bottom pick entry/exit path by timestamp without a global sort.
 */
export function sessionsPipeline(limit: number): Document[] {
  return [
    {
      $group: {
        _id: "$sessionId",
        events: { $sum: 1 },
        firstSeen: { $min: "$ts" },
        lastSeen: { $max: "$ts" },
        pageViews: countType("page_view"),
        clicks: countType("click"),
        rageClicks: countType("rage_click"),
        deadClicks: countType("dead_click"),
        // Events in one batch share a server receive time, so break ts ties by _id
        // (insertion order = the client's enqueue sequence) for a stable entry/exit.
        entryPath: { $top: { sortBy: { ts: 1, _id: 1 }, output: "$path" } },
        lastPath: { $bottom: { sortBy: { ts: 1, _id: 1 }, output: "$path" } },
      },
    },
    { $sort: { lastSeen: -1 } },
    { $limit: limit },
    // Enrich the (limited) set with session-level geo + consent from the sessions collection.
    { $lookup: { from: "sessions", localField: "_id", foreignField: "_id", as: "_session" } },
  ];
}

/** Map one aggregation result document into the API's SessionSummary shape. */
export function toSessionSummary(doc: Document): SessionSummary {
  const first = doc.firstSeen as Date;
  const last = doc.lastSeen as Date;
  const session = Array.isArray(doc._session) ? doc._session[0] : undefined;
  const summary: SessionSummary = {
    sessionId: doc._id as string,
    events: doc.events as number,
    pageViews: doc.pageViews as number,
    clicks: doc.clicks as number,
    rageClicks: doc.rageClicks as number,
    deadClicks: doc.deadClicks as number,
    firstSeen: first.toISOString(),
    lastSeen: last.toISOString(),
    durationMs: last.getTime() - first.getTime(),
    entryPath: (doc.entryPath as string) ?? "",
    lastPath: (doc.lastPath as string) ?? "",
  };
  if (session?.geo) summary.geo = { country: session.geo.country, region: session.geo.region };
  if (session?.consent?.tier) summary.consentTier = session.consent.tier;
  return summary;
}

export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  const capped = Math.min(Math.max(limit, 1), MAX_SESSIONS);
  const col = await eventsCollection();
  const docs = await col.aggregate(sessionsPipeline(capped)).toArray();
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
