import { describe, it, expect } from "vitest";
import {
  CONSENT_VERSION,
  cookieFromHeader,
  isAnalyticsAllowed,
  makeState,
  parse,
  PRESET_ALL,
  PRESET_DENIED,
  PRESET_NECESSARY,
  serialize,
  tierOf,
} from "@/lib/consent";

describe("consent model", () => {
  it("round-trips a state through serialize/parse", () => {
    const s = makeState(PRESET_ALL, 1234);
    const back = parse(serialize(s));
    expect(back).toEqual({ v: CONSENT_VERSION, a: true, l: true, d: true, t: 1234 });
  });

  it("rejects a stale version (forces re-prompt)", () => {
    const stale = JSON.stringify({ v: CONSENT_VERSION - 1, a: true, l: true, d: true, t: 1 });
    expect(parse(stale)).toBeNull();
  });

  it("rejects malformed or missing values", () => {
    expect(parse(null)).toBeNull();
    expect(parse("not json")).toBeNull();
    expect(parse(JSON.stringify({ v: CONSENT_VERSION, a: "yes" }))).toBeNull();
  });

  it("classifies tiers", () => {
    expect(tierOf(PRESET_ALL)).toBe("all");
    expect(tierOf(PRESET_NECESSARY)).toBe("necessary");
    expect(tierOf(PRESET_DENIED)).toBe("denied");
    expect(tierOf({ a: true, l: true, d: false })).toBe("custom");
  });

  it("gates analytics on the analytics purpose only", () => {
    expect(isAnalyticsAllowed(makeState(PRESET_NECESSARY))).toBe(true);
    expect(isAnalyticsAllowed(makeState(PRESET_DENIED))).toBe(false);
    expect(isAnalyticsAllowed(null)).toBe(false);
  });

  it("reads a cookie value from a Cookie header", () => {
    expect(cookieFromHeader("a=1; cf_consent=hello; b=2", "cf_consent")).toBe("hello");
    expect(cookieFromHeader("", "cf_consent")).toBeNull();
    expect(cookieFromHeader(null, "cf_consent")).toBeNull();
  });
});
