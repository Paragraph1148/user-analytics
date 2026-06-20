import { describe, it, expect } from "vitest";
import { clientIp, lookupGeo } from "@/lib/geo";

describe("clientIp", () => {
  it("takes the last PUBLIC IP from X-Forwarded-For (App Runner appends the real client)", () => {
    // forged/private prefix + real appended IP -> use the real one
    expect(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1, 223.181.85.95" }))).toBe("223.181.85.95");
    // a spoofed first entry must not win
    expect(clientIp(new Headers({ "x-forwarded-for": "8.8.8.8, 223.181.85.95" }))).toBe("223.181.85.95");
    // single real entry
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("skips private/loopback/CGNAT entries", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 192.168.1.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "100.64.0.1, 127.0.0.1" }))).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "::ffff:8.8.8.8" }))).toBe("8.8.8.8");
  });

  it("falls back to X-Real-IP, else null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("lookupGeo (graceful)", () => {
  it("returns null for no IP", async () => {
    expect(await lookupGeo(null)).toBeNull();
  });

  it("returns null when the GeoLite2 DB isn't present", async () => {
    // No DB bundled in the test environment — must degrade, not throw.
    expect(await lookupGeo("8.8.8.8")).toBeNull();
  });
});
