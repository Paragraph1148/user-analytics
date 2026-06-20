import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONSENT_COOKIE, makeState, PRESET_ALL, PRESET_DENIED, serialize } from "@/lib/consent";

// Mock the data layer so the route is tested in isolation (and lib/db is never loaded).
const insertEvents = vi.fn(async (events: unknown[]) => events.length);
const ensureIndexes = vi.fn(async () => {});
vi.mock("@/lib/events", () => ({
  insertEvents: (events: unknown[]) => insertEvents(events),
  ensureIndexes: () => ensureIndexes(),
}));
// The route also enriches sessions (geo + session upsert); stub those so the test stays
// isolated from the DB and the geo database.
vi.mock("@/lib/sessions", () => ({ upsertSession: vi.fn(async () => {}) }));
vi.mock("@/lib/geo", () => ({ lookupGeo: vi.fn(async () => null), clientIp: () => null }));

import { POST } from "@/app/api/collect/route";

const valid = { sessionId: "abc123", type: "click", url: "http://localhost/demo" };

function consentCookie(purposes = PRESET_ALL): string {
  return `${CONSENT_COOKIE}=${encodeURIComponent(serialize(makeState(purposes)))}`;
}

// By default, requests carry analytics consent so the body-handling assertions run.
function post(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: consentCookie(), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  insertEvents.mockClear();
  ensureIndexes.mockClear();
});

describe("POST /api/collect", () => {
  it("accepts a single event when analytics is consented", async () => {
    const res = await POST(post(valid));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 1, rejected: 0 });
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

  it("stores nothing without a consent cookie", async () => {
    const res = await POST(
      new Request("http://localhost/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      }),
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ accepted: 0, skipped: "consent" });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("stores nothing when analytics consent is withdrawn", async () => {
    const res = await POST(post(valid, { Cookie: consentCookie(PRESET_DENIED) }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ skipped: "consent" });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("honors a DNT header and stores nothing", async () => {
    const res = await POST(post(valid, { DNT: "1" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ skipped: "dnt" });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("honors a Sec-GPC header and stores nothing", async () => {
    const res = await POST(post(valid, { "Sec-GPC": "1" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ skipped: "dnt" });
    expect(insertEvents).not.toHaveBeenCalled();
  });
});
