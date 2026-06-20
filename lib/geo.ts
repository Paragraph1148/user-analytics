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

// Loopback / unspecified addresses can't be geolocated (local dev sends these).
function usableIp(ip: string | null | undefined): string | null {
  const v = ip?.trim();
  if (!v || v === "::1" || v === "::" || v === "127.0.0.1" || v.startsWith("::ffff:127.")) {
    return null;
  }
  return v;
}

/** First usable IP from the proxy chain (App Runner forwards the client IP in
 *  X-Forwarded-For). On localhost there's no forwarded public IP, so geo can't resolve; set
 *  GEOIP_FALLBACK_IP in development to exercise the geo path locally. Never used in prod. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  const ip = usableIp(xff?.split(",")[0]) ?? usableIp(headers.get("x-real-ip"));
  if (ip) return ip;
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
