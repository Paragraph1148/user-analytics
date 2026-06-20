import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONSENT_COOKIE, makeState, PRESET_ALL, PRESET_NECESSARY, serialize, type Purposes } from "@/lib/consent";
import { sanitizeDevice, roundPrecise } from "@/lib/sessions";

// Keep sanitizeDevice/roundPrecise real; stub only the DB write.
const updateSessionAttributes = vi.fn(async (..._args: unknown[]): Promise<boolean> => true);
vi.mock("@/lib/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sessions")>();
  return { ...actual, updateSessionAttributes: (...args: unknown[]) => updateSessionAttributes(...args) };
});

import { POST } from "@/app/api/session/route";

describe("sanitizeDevice", () => {
  it("keeps known fields, bounds strings, drops unknown/garbage", () => {
    const d = sanitizeDevice({
      ua: "x".repeat(500),
      cores: 8,
      mobile: false,
      gpu: "Apple M2",
      memory: "lots", // wrong type -> dropped
      password: "secret", // unknown -> dropped
    });
    expect(d?.ua).toHaveLength(256);
    expect(d?.cores).toBe(8);
    expect(d?.mobile).toBe(false);
    expect(d?.gpu).toBe("Apple M2");
    expect(d as Record<string, unknown>).not.toHaveProperty("memory");
    expect(d as Record<string, unknown>).not.toHaveProperty("password");
  });

  it("returns null for empty/invalid input", () => {
    expect(sanitizeDevice(null)).toBeNull();
    expect(sanitizeDevice({ nope: 1 })).toBeNull();
  });
});

describe("roundPrecise", () => {
  it("rounds to ~3 decimals and validates range", () => {
    expect(roundPrecise({ lat: 37.421998, lng: -122.084 })).toEqual({ lat: 37.422, lng: -122.084 });
    expect(roundPrecise({ lat: 200, lng: 0 })).toBeNull();
    expect(roundPrecise({ lat: "x", lng: 1 })).toBeNull();
    expect(roundPrecise(null)).toBeNull();
  });
});

function req(body: unknown, purposes?: Purposes): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (purposes) {
    headers.Cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serialize(makeState(purposes)))}`;
  }
  return new Request("http://localhost/api/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const device = { ua: "Mozilla/5.0", cores: 8 };
const precise = { lat: 1.23456, lng: 2.34567 };

describe("POST /api/session", () => {
  beforeEach(() => updateSessionAttributes.mockClear());

  it("stores device + precise under Allow-all consent", async () => {
    const res = await POST(req({ sessionId: "abc", device, precise }, PRESET_ALL));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ stored: { device: true, precise: true } });
    const arg = updateSessionAttributes.mock.calls[0][1] as { device: unknown; precise: unknown };
    expect(arg.device).toBeTruthy();
    expect(arg.precise).toEqual({ lat: 1.235, lng: 2.346 });
  });

  it("drops both under Necessary consent (no device/precise purpose)", async () => {
    const res = await POST(req({ sessionId: "abc", device, precise }, PRESET_NECESSARY));
    expect(await res.json()).toMatchObject({ skipped: "nothing-permitted" });
    expect(updateSessionAttributes).not.toHaveBeenCalled();
  });

  it("stores only what each purpose allows", async () => {
    await POST(req({ sessionId: "abc", device, precise }, { a: true, l: true, d: false }));
    const arg = updateSessionAttributes.mock.calls[0][1] as { device: unknown; precise: unknown };
    expect(arg.device).toBeNull();
    expect(arg.precise).toBeTruthy();
  });

  it("skips without consent", async () => {
    const res = await POST(req({ sessionId: "abc", device }));
    expect(await res.json()).toMatchObject({ skipped: "consent" });
    expect(updateSessionAttributes).not.toHaveBeenCalled();
  });

  it("rejects an invalid session id", async () => {
    const res = await POST(req({ sessionId: "bad id", device }, PRESET_ALL));
    expect(res.status).toBe(400);
  });
});
