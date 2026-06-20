// Shared consent model — used by the consent banner (client), the API routes (server),
// and mirrored by the vanilla tracker. Pure: no DOM access here so it's safe on both
// sides. Bumping CONSENT_VERSION invalidates stored consent and re-prompts everyone.

export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE = "cf_consent";

// Granular purposes. `analytics` is the Necessary set (behavioral events + coarse geo);
// the other two unlock the richer, higher-risk collection in later phases.
export type Purpose = "analytics" | "precise_location" | "device_profiling";

/** Stored consent: version + per-purpose booleans + timestamp. Short keys keep the
 *  cookie small and easy for the vanilla tracker to parse (a/l/d = the three purposes). */
export interface ConsentState {
  v: number;
  a: boolean; // analytics
  l: boolean; // precise_location
  d: boolean; // device_profiling
  t: number; // chosen-at epoch ms
}

export type Purposes = Pick<ConsentState, "a" | "l" | "d">;

export const PRESET_NECESSARY: Purposes = { a: true, l: false, d: false };
export const PRESET_ALL: Purposes = { a: true, l: true, d: true };
export const PRESET_DENIED: Purposes = { a: false, l: false, d: false };

export type Tier = "necessary" | "all" | "custom" | "denied";

export function tierOf(p: Purposes): Tier {
  if (!p.a && !p.l && !p.d) return "denied";
  if (p.a && p.l && p.d) return "all";
  if (p.a && !p.l && !p.d) return "necessary";
  return "custom";
}

export function makeState(p: Purposes, now = Date.now()): ConsentState {
  return { v: CONSENT_VERSION, a: p.a, l: p.l, d: p.d, t: now };
}

export function serialize(state: ConsentState): string {
  return JSON.stringify(state);
}

/** Parse a stored consent value; returns null if malformed or from an older version
 *  (which forces a re-prompt). */
export function parse(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<ConsentState>;
    if (
      typeof o.v !== "number" ||
      o.v !== CONSENT_VERSION ||
      typeof o.a !== "boolean" ||
      typeof o.l !== "boolean" ||
      typeof o.d !== "boolean"
    ) {
      return null;
    }
    return { v: o.v, a: o.a, l: o.l, d: o.d, t: typeof o.t === "number" ? o.t : 0 };
  } catch {
    return null;
  }
}

/** Read one cookie's raw (still URL-encoded) value from a Cookie header string. */
export function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  const m = header.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function isAnalyticsAllowed(state: ConsentState | null): boolean {
  return !!state && state.a === true;
}
