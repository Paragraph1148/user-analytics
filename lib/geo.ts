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

// Open the DB once; on failure (missing file) cache null so we don't retry every request.
let readerPromise: Promise<Reader<CityResponse> | null> | null = null;
function getReader(): Promise<Reader<CityResponse> | null> {
  if (!readerPromise) {
    readerPromise = open<CityResponse>(DB_PATH).catch(() => null);
  }
  return readerPromise;
}

/** First IP from the proxy chain (App Runner forwards the client IP in X-Forwarded-For). */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  return headers.get("x-real-ip");
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
