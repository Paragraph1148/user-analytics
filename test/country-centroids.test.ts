import { describe, it, expect } from "vitest";
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids";

describe("COUNTRY_CENTROIDS", () => {
  it("has common countries", () => {
    for (const code of ["US", "GB", "IN", "DE", "AU"]) {
      expect(COUNTRY_CENTROIDS[code]).toBeDefined();
    }
  });

  it("every entry is a valid [lat, lng]", () => {
    for (const [code, [lat, lng]] of Object.entries(COUNTRY_CENTROIDS)) {
      expect(code, `${code} key`).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(lat), `${code} lat`).toBeLessThanOrEqual(90);
      expect(Math.abs(lng), `${code} lng`).toBeLessThanOrEqual(180);
    }
  });
});
