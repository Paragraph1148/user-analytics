// Coarse, server-side IP geolocation for the Necessary tier. We resolve country/region
// from the request IP and store ONLY that — the raw IP is never persisted (derive-and-drop).
//
// Uses a local MaxMind GeoLite2 database (no IP leaves our server). The DB is licensed and
// not committed; provide it via GEOIP_DB_PATH (see README / Dockerfile). If it's absent,
// geo lookups return null and the rest of the pipeline works unchanged.

import { open, type Reader, type CityResponse } from "maxmind";

export interface Geo {
  country?: string; // ISO code, e.g. "US"
  region?: string; // top subdivision ISO code, e.g. "CA"
}

const DB_PATH = process.env.GEOIP_DB_PATH ?? "./data/GeoLite2-City.mmdb";

// Open the DB once and reuse the reader. A failed open is NOT cached permanently — we reset
// so the next lookup retries (otherwise one transient cold-start failure would disable geo
// for the whole life of that instance).
let readerPromise: Promise<Reader<CityResponse> | null> | null = null;
function getReader(): Promise<Reader<CityResponse> | null> {
  if (!readerPromise) {
    readerPromise = open<CityResponse>(DB_PATH).catch((err) => {
      console.error("[geo] failed to open DB at", DB_PATH, err instanceof Error ? err.message : err);
      readerPromise = null; // allow a retry on the next call
      return null;
    });
  }
  return readerPromise;
}

// A public, geolocatable IP, or null for loopback/private/link-local/CGNAT (which can't be
// geolocated and may be spoofed in a forged X-Forwarded-For prefix). Strips IPv4-mapped IPv6.
function usableIp(ip: string | null | undefined): string | null {
  let s = ip?.trim();
  if (!s) return null;
  if (s.startsWith("::ffff:")) s = s.slice(7); // IPv4-mapped IPv6 -> IPv4
  const low = s.toLowerCase();
  if (s === "::1" || s === "::" || low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) {
    return null; // IPv6 loopback / link-local / unique-local
  }
  if (s.startsWith("127.") || s.startsWith("10.") || s.startsWith("192.168.") || s.startsWith("169.254.")) {
    return null;
  }
  const m172 = s.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return null; // 172.16/12
  const m100 = s.match(/^100\.(\d+)\./);
  if (m100 && +m100[1] >= 64 && +m100[1] <= 127) return null; // 100.64/10 CGNAT
  return s;
}

/** The real client IP for geolocation. App Runner (and edge proxies generally) APPEND the
 *  real client IP to X-Forwarded-For, so the trustworthy value is the LAST public entry —
 *  taking the first would use a client-forged/private prefix (the bug behind null geo). On
 *  localhost there's no public IP; set GEOIP_FALLBACK_IP in dev to exercise geo locally. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    for (let i = parts.length - 1; i >= 0; i--) {
      const ip = usableIp(parts[i]);
      if (ip) return ip;
    }
  }
  const real = usableIp(headers.get("x-real-ip"));
  if (real) return real;
  if (process.env.NODE_ENV !== "production" && process.env.GEOIP_FALLBACK_IP) {
    return process.env.GEOIP_FALLBACK_IP;
  }
  return null;
}

/** Look up coarse geo for an IP. Returns null on any miss/error/missing DB. */
export async function lookupGeo(ip: string | null): Promise<Geo | null> {
  if (!ip) return null;
  const reader = await getReader();
  if (!reader) return null;
  try {
    const r = reader.get(ip);
    if (!r) return null;
    const geo: Geo = {};
    if (r.country?.iso_code) geo.country = r.country.iso_code;
    if (r.subdivisions?.[0]?.iso_code) geo.region = r.subdivisions[0].iso_code;
    return geo.country || geo.region ? geo : null;
  } catch {
    return null;
  }
}
