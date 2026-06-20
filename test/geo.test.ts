import { describe, it, expect } from "vitest";
import { clientIp, lookupGeo } from "@/lib/geo";

describe("clientIp", () => {
  it("takes the first IP from X-Forwarded-For", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
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
