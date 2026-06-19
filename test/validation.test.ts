import { describe, it, expect } from "vitest";
import { normalizeEvent, normalizeBody } from "@/lib/validation";

const base = {
  sessionId: "a1B2c3_-",
  type: "click",
  url: "https://example.com/demo?q=1",
};

describe("normalizeEvent", () => {
  it("accepts a valid event, assigns ts and derives path from url", () => {
    const now = new Date("2026-06-19T00:00:00Z");
    const ev = normalizeEvent({ ...base, x: 10, y: 20 }, now);
    expect(ev).not.toBeNull();
    expect(ev!.path).toBe("/demo");
    expect(ev!.ts).toBe(now);
    expect(ev!.x).toBe(10);
    expect(ev!.y).toBe(20);
  });

  it("rejects a bad sessionId", () => {
    expect(normalizeEvent({ ...base, sessionId: "has spaces" })).toBeNull();
    expect(normalizeEvent({ ...base, sessionId: "x".repeat(65) })).toBeNull();
    expect(normalizeEvent({ ...base, sessionId: 123 })).toBeNull();
  });

  it("rejects an unknown event type", () => {
    expect(normalizeEvent({ ...base, type: "keypress" })).toBeNull();
  });

  it("rejects a non-http(s) or unparseable url", () => {
    expect(normalizeEvent({ ...base, url: "javascript:alert(1)" })).toBeNull();
    expect(normalizeEvent({ ...base, url: "not a url" })).toBeNull();
    expect(normalizeEvent({ ...base, url: 42 })).toBeNull();
  });

  it("drops out-of-range coordinates instead of storing garbage", () => {
    const ev = normalizeEvent({ ...base, x: -5, y: 1e9, vpW: 1440 });
    expect(ev).not.toBeNull();
    expect(ev!.x).toBeUndefined();
    expect(ev!.y).toBeUndefined();
    expect(ev!.vpW).toBe(1440);
  });

  it("never carries unexpected top-level fields", () => {
    const ev = normalizeEvent({ ...base, password: "secret", value: "typed text" });
    expect(ev).not.toBeNull();
    expect(ev as unknown as Record<string, unknown>).not.toHaveProperty("password");
    expect(ev as unknown as Record<string, unknown>).not.toHaveProperty("value");
  });

  it("sanitizes meta: keeps shallow primitives, drops functions/deep nesting", () => {
    const ev = normalizeEvent({
      ...base,
      meta: {
        tag: "button",
        depthPct: 75,
        active: true,
        nested: { role: "submit", deep: { tooDeep: true } },
        arr: [1, 2, 3],
      },
    });
    expect(ev!.meta).toEqual({
      tag: "button",
      depthPct: 75,
      active: true,
      nested: { role: "submit" },
    });
  });
});

describe("normalizeBody", () => {
  it("normalizes a single object into one event", () => {
    const res = normalizeBody({ ...base });
    expect(res).not.toBeNull();
    expect(res!.events).toHaveLength(1);
    expect(res!.rejected).toBe(0);
  });

  it("normalizes a batch and counts rejects", () => {
    const res = normalizeBody([{ ...base }, { ...base, type: "bogus" }, { ...base }]);
    expect(res!.events).toHaveLength(2);
    expect(res!.rejected).toBe(1);
  });

  it("returns null for a structurally unusable body", () => {
    expect(normalizeBody("nope")).toBeNull();
    expect(normalizeBody(42)).toBeNull();
    expect(normalizeBody(null)).toBeNull();
  });
});
