import { describe, it, expect } from "vitest";
import { sessionsPipeline, toSessionSummary } from "@/lib/events";

describe("sessionsPipeline", () => {
  it("groups by sessionId with the expected accumulators", () => {
    const stages = sessionsPipeline(25) as Array<Record<string, unknown>>;
    const group = (stages.find((s) => "$group" in s) as { $group: Record<string, unknown> })
      .$group;
    expect(group._id).toBe("$sessionId");
    for (const k of ["events", "firstSeen", "lastSeen", "pageViews", "clicks", "rageClicks", "deadClicks", "entryPath", "lastPath"]) {
      expect(group).toHaveProperty(k);
    }
  });

  it("sorts by most-recent, limits, and joins the sessions collection", () => {
    const stages = sessionsPipeline(25) as Array<Record<string, unknown>>;
    expect(stages.some((s) => JSON.stringify(s.$sort) === JSON.stringify({ lastSeen: -1 }))).toBe(true);
    expect(stages.some((s) => s.$limit === 25)).toBe(true);
    expect(
      stages.some((s) => (s.$lookup as { from?: string } | undefined)?.from === "sessions"),
    ).toBe(true);
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

  it("maps joined geo + consent tier when the session record is present", () => {
    const summary = toSessionSummary({
      _id: "sess_2",
      events: 1,
      firstSeen: new Date("2026-06-19T10:00:00Z"),
      lastSeen: new Date("2026-06-19T10:00:00Z"),
      pageViews: 1,
      clicks: 0,
      rageClicks: 0,
      deadClicks: 0,
      entryPath: "/",
      lastPath: "/",
      _session: [{ geo: { country: "US", region: "CA", source: "ip" }, consent: { tier: "all" } }],
    });
    expect(summary.geo).toEqual({ country: "US", region: "CA" });
    expect(summary.consentTier).toBe("all");
  });
});
