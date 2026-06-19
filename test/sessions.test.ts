import { describe, it, expect } from "vitest";
import { sessionsPipeline, toSessionSummary } from "@/lib/events";

describe("sessionsPipeline", () => {
  it("groups by sessionId with the expected accumulators", () => {
    const pipeline = sessionsPipeline(25);
    const group = (pipeline[0] as { $group: Record<string, unknown> }).$group;
    expect(group._id).toBe("$sessionId");
    for (const k of ["events", "firstSeen", "lastSeen", "pageViews", "clicks", "rageClicks", "deadClicks", "entryPath", "lastPath"]) {
      expect(group).toHaveProperty(k);
    }
  });

  it("sorts by most-recent and applies the given limit", () => {
    const pipeline = sessionsPipeline(25);
    expect(pipeline.at(-2)).toEqual({ $sort: { lastSeen: -1 } });
    expect(pipeline.at(-1)).toEqual({ $limit: 25 });
  });
});

describe("toSessionSummary", () => {
  it("maps a raw doc and computes durationMs from first/last seen", () => {
    const first = new Date("2026-06-19T10:00:00.000Z");
    const last = new Date("2026-06-19T10:05:30.000Z");
    const summary = toSessionSummary({
      _id: "sess_1",
      events: 12,
      firstSeen: first,
      lastSeen: last,
      pageViews: 2,
      clicks: 8,
      rageClicks: 1,
      deadClicks: 1,
      entryPath: "/demo",
      lastPath: "/pricing",
    });

    expect(summary).toEqual({
      sessionId: "sess_1",
      events: 12,
      pageViews: 2,
      clicks: 8,
      rageClicks: 1,
      deadClicks: 1,
      firstSeen: "2026-06-19T10:00:00.000Z",
      lastSeen: "2026-06-19T10:05:30.000Z",
      durationMs: 330_000,
      entryPath: "/demo",
      lastPath: "/pricing",
    });
  });
});
