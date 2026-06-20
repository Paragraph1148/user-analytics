import { describe, it, expect } from "vitest";
import {
  scrollDistributionPipeline,
  sessionsPipeline,
  toSessionSummary,
  topElementsPipeline,
} from "@/lib/events";

describe("sessionsPipeline", () => {
  it("runs on sessions: sorts, limits, and looks up event stats", () => {
    const stages = sessionsPipeline(25) as Array<Record<string, unknown>>;
    expect(stages.some((s) => JSON.stringify(s.$sort) === JSON.stringify({ lastSeen: -1 }))).toBe(true);
    expect(stages.some((s) => s.$limit === 25)).toBe(true);
    const lookup = stages.find((s) => "$lookup" in s)!.$lookup as {
      from: string;
      pipeline: Array<Record<string, unknown>>;
    };
    expect(lookup.from).toBe("events");
    const group = lookup.pipeline.find((s) => "$group" in s)!.$group as Record<string, unknown>;
    for (const k of ["events", "pageViews", "clicks", "rageClicks", "deadClicks", "entryPath", "lastPath"]) {
      expect(group).toHaveProperty(k);
    }
  });
});

describe("toSessionSummary", () => {
  it("maps a session doc + looked-up stats, computing durationMs", () => {
    const summary = toSessionSummary({
      _id: "sess_1",
      geo: { country: "US", region: "CA", source: "ip" },
      consent: { tier: "all" },
      stats: [
        {
          events: 12,
          firstSeen: new Date("2026-06-19T10:00:00.000Z"),
          lastSeen: new Date("2026-06-19T10:05:30.000Z"),
          pageViews: 2,
          clicks: 8,
          rageClicks: 1,
          deadClicks: 1,
          entryPath: "/demo",
          lastPath: "/pricing",
        },
      ],
    });
    expect(summary).toMatchObject({
      sessionId: "sess_1",
      events: 12,
      clicks: 8,
      durationMs: 330_000,
      entryPath: "/demo",
      lastPath: "/pricing",
      geo: { country: "US", region: "CA" },
      consentTier: "all",
    });
  });

  it("handles a session with no events (ghost session) using session timestamps", () => {
    const t = new Date("2026-06-19T10:00:00.000Z");
    const summary = toSessionSummary({
      _id: "ghost",
      firstSeen: t,
      lastSeen: t,
      consent: { tier: "all" },
      stats: [],
    });
    expect(summary.events).toBe(0);
    expect(summary.entryPath).toBe("—");
    expect(summary.durationMs).toBe(0);
    expect(summary.consentTier).toBe("all");
  });
});

describe("topElementsPipeline", () => {
  it("counts plain clicks per element (tag+label) for a path, most first", () => {
    const stages = topElementsPipeline("/demo", 20) as Array<Record<string, unknown>>;
    const match = stages.find((s) => "$match" in s)!.$match as { type: string; path: string };
    expect(match.type).toBe("click"); // not rage/dead — avoids double counting
    expect(match.path).toBe("/demo");
    expect(stages.some((s) => s.$limit === 20)).toBe(true);
    expect(stages.some((s) => JSON.stringify(s.$sort) === JSON.stringify({ clicks: -1 }))).toBe(true);
  });
});

describe("sessionBreakdownPipeline", () => {
  it("groups sessions by a field path, most first, excluding nulls", async () => {
    const { sessionBreakdownPipeline } = await import("@/lib/sessions");
    const stages = sessionBreakdownPipeline("geo.country", 10) as Array<Record<string, unknown>>;
    const match = stages.find((s) => "$match" in s)!.$match as Record<string, unknown>;
    expect(match["geo.country"]).toEqual({ $exists: true, $ne: null });
    const group = stages.find((s) => "$group" in s)!.$group as { _id: string };
    expect(group._id).toBe("$geo.country");
    expect(stages.some((s) => s.$limit === 10)).toBe(true);
  });
});

describe("scrollDistributionPipeline", () => {
  it("counts distinct sessions per depth milestone for a path", () => {
    const stages = scrollDistributionPipeline("/demo") as Array<Record<string, unknown>>;
    const match = stages.find((s) => "$match" in s)!.$match as { type: string };
    expect(match.type).toBe("scroll");
    const group = stages.find((s) => "$group" in s)!.$group as { sessions: unknown };
    expect(group.sessions).toEqual({ $addToSet: "$sessionId" }); // distinct sessions
  });
});
