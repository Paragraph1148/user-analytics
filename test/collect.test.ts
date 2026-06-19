import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data layer so the route is tested in isolation (and lib/db is never loaded).
const insertEvents = vi.fn(async (events: unknown[]) => events.length);
const ensureIndexes = vi.fn(async () => {});
vi.mock("@/lib/events", () => ({
  insertEvents: (events: unknown[]) => insertEvents(events),
  ensureIndexes: () => ensureIndexes(),
}));

import { POST } from "@/app/api/collect/route";

const valid = { sessionId: "abc123", type: "click", url: "http://localhost/demo" };

function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/collect", {
    method: "POST",
    headers: headers ?? { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  insertEvents.mockClear();
  ensureIndexes.mockClear();
});

describe("POST /api/collect", () => {
  it("accepts a single event", async () => {
    const res = await POST(post(valid));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 1, rejected: 0 });
    expect(insertEvents).toHaveBeenCalledOnce();
    expect(insertEvents.mock.calls[0][0]).toHaveLength(1);
  });

  it("accepts a batch and reports rejects", async () => {
    const res = await POST(post([valid, { type: "bogus" }, valid]));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2, rejected: 1 });
    expect(insertEvents.mock.calls[0][0]).toHaveLength(2);
  });

  it("rejects malformed JSON without touching the database", async () => {
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("rejects a structurally wrong body", async () => {
    const res = await POST(post('"a string"'));
    expect(res.status).toBe(400);
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("honors a DNT header and stores nothing", async () => {
    const res = await POST(post(valid, { "Content-Type": "application/json", DNT: "1" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0, rejected: 0, skipped: true });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("honors a Sec-GPC header and stores nothing", async () => {
    const res = await POST(post(valid, { "Content-Type": "application/json", "Sec-GPC": "1" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(insertEvents).not.toHaveBeenCalled();
  });
});
