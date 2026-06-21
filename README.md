# User Analytics

Privacy-forward, cookieless session analytics. It tracks how people use a page —
page views, clicks, and frustration signals — and shows them as **user journeys**, a
**click heatmap**, and an **audience view** (locations map + device/consent breakdowns).
Built as a take-home for the CausalFunnel Full Stack Engineer role.

> **v2** adds consent-gated enrichment on top of the v1 core: a per-purpose consent banner,
> coarse IP geolocation, an optional high-entropy device profile and precise location (both
> opt-in), a `sessions` collection, the audience dashboard, and self-serve erasure — all
> still gated by GPC/DNT and enforced server-side. See
> [Consent & data-subject rights](#consent--data-subject-rights-v2).

## The one decision that defines this build

CausalFunnel's product is cookieless, privacy-conscious analytics, so the project is split
into two clearly separated parts:

1. **The core pipeline is privacy-forward** — what we'd actually ship. A durable
   first-party session id (no fingerprinting, no evercookie), reliable delivery, behavioral
   signals, and a heatmap. It honors Do Not Track and Global Privacy Control and stores no
   PII.
2. **A separate, clearly-labeled [`/research`](#research-module) module** studies *invasive*
   techniques (fingerprinting, evercookie respawning) as interactive demos only — each
   paired with the defenses that beat it and an explicit note that it is **deliberately not
   used** in the core pipeline.

Showing both, and making the privacy-respecting choice on purpose, is the point.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict). Route handlers are
  the backend.
- **MongoDB Atlas** via the official `mongodb` driver — an append-only `events` collection
  plus a `sessions` collection for session-level state (consent, geo, device).
- **Tailwind CSS v4** (CSS-first `@theme`, no config file), Geist + Geist Mono.
- **Leaflet + OpenStreetMap** for the audience locations map (no API key, tiles from OSM).
- **MaxMind GeoLite2** (local DB) for coarse, server-side IP geolocation — the IP never
  leaves the server and is never stored.
- **Vitest** for unit tests.
- **Docker** standalone image for **AWS App Runner**.

## Getting started

Prerequisites: Node 20+ and a MongoDB Atlas connection string (free tier is fine).

```bash
npm install
cp .env.example .env.local        # then fill in MONGODB_URI
npm run dev                        # http://localhost:3000
```

Then open **`/demo`**, accept analytics, click around (and scroll) to generate events, and
view them in the dashboard at **`/sessions`**, **`/heatmap`**, and **`/audience`**.

> Coarse geolocation needs the MaxMind GeoLite2 City DB, which is licensed and not committed.
> Without it everything still works — locations are simply blank. To enable it locally,
> download `GeoLite2-City.mmdb` and point `GEOIP_DB_PATH` at it; on localhost there's no
> public IP, so set `GEOIP_FALLBACK_IP` to exercise geo in dev.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build (standalone output) |
| `npm start` | Run the production build |
| `npm test` | Unit tests (validation + collect route + sessions aggregation) |
| `npm run lint` | ESLint |

### Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGODB_URI` | yes | — | Atlas connection string. Read at runtime; never committed. |
| `MONGODB_DB` | no | `analytics` | Database name within the cluster. |
| `GEOIP_DB_PATH` | no | `./data/GeoLite2-City.mmdb` | Path to the MaxMind GeoLite2 City DB. Absent → geo lookups return null and the pipeline runs unchanged. |
| `GEOIP_FALLBACK_IP` | no | — | Dev-only. A public IP used for geo when there's no real client IP (e.g. localhost). Ignored in production. |

## Privacy guarantees (core pipeline)

These are non-negotiable in the production path:

- **Respects `navigator.doNotTrack` and `navigator.globalPrivacyControl` (GPC).** If either
  is set, the tracker collects nothing and never touches storage. As defense-in-depth,
  `POST /api/collect` also drops any request carrying a `DNT: 1` or `Sec-GPC: 1` header.
- **First-party session id only.** `localStorage` primary with a first-party cookie
  fallback; the two are reconciled so clearing one (within the 30-minute inactivity window)
  keeps the session intact, and clearing both starts a fresh one. No fingerprinting, no
  evercookie.
- **No PII.** Clicks are coordinates + element tag — never input values or typed text.
  Incoming payloads are validated server-side and unknown fields are stripped.

## Consent & data-subject rights (v2)

v2 adds richer, consent-gated collection while keeping the privacy posture above. The model
is **privacy through control**, enforced end to end:

- **Opt-in before collection.** A consent banner offers **Necessary / Allow all / Manage**
  (granular per-purpose toggles: `analytics`, `precise_location`, `device_profiling`).
  Nothing is collected until the user chooses; pre-consent events are dropped.
- **GPC/DNT is a hard override** above the banner — if set, nothing is collected regardless
  of any choice.
- **Server-enforced consent.** `/api/collect` and `/api/session` independently re-check the
  first-party `cf_consent` cookie and drop anything a purpose doesn't permit — the client is
  never trusted to self-censor.
- **Data minimization.** The raw IP is derived to coarse country/region and **dropped, never
  stored**; precise coordinates are **rounded to ~110 m**; device profiles are sanitized to
  known fields.
- **Right to erasure (self-serve).** "Delete my data" calls `DELETE /api/sessions/[id]`,
  authorized by the first-party cookie (a visitor can only delete their own data). It purges
  events, the session record, and consent-log entries.
- **Withdrawal** stops collection immediately (consent set to denied; the tracker tears down
  live).
- **Retention.** Raw events expire via a MongoDB **TTL index (90 days)**; derived sessions
  and the **consent-log audit trail** (record of every consent decision) are kept.
- **Still off-limits even with consent:** evercookie respawning — it conflicts with the right
  to withdraw, so it stays a `/research` study only.

## How it works

### Tracker (`public/tracker.js`)

Vanilla JS, no build step — drop it on any page with `<script src="/tracker.js"></script>`.
It captures `page_view` and `click`, plus richer behavioral signals: **rage clicks** (a
burst of clicks in a tight area), **dead clicks** (a click that changes nothing on a
non-interactive element), **scroll depth** milestones, and **time-on-page** (`page_exit`).
Delivery is reliable: an in-memory queue flushes periodically via `fetch`, on page hide via
`navigator.sendBeacon`, with capped exponential-backoff retry so events aren't lost.

### Data model

The append-only `events` collection is the source of truth for behavior:

```ts
{
  sessionId: string,             // first-party id
  type: "page_view" | "click" | "rage_click" | "dead_click" | "scroll" | "page_exit",
  url: string, path: string,     // path is indexed for heatmap-by-page
  ts: Date,                      // server-assigned (client clock is never trusted)
  x?, y?, vpW?, vpH?: number,    // click coords + viewport, for heatmap normalization
  referrer?: string,
  meta?: object                  // bounded, non-identifying (tag, scroll %, dwell ms)
}
```

Indexes: `{ sessionId: 1, ts: 1 }` (journey), `{ path: 1, type: 1 }` (heatmap),
`{ ts: -1 }` (recent), plus a **TTL index** on `ts` (90 days) so raw events expire.

A second collection, `sessions`, holds the mutable, stable-per-session state that doesn't
belong on every event — current consent, coarse geo, and (opt-in) device profile / precise
location. It's upserted on ingest, keyed by `sessionId`:

```ts
{
  _id: sessionId,
  firstSeen, lastSeen: Date,
  consent: { tier, version, purposes },
  geo?:     { country, region, source: "ip" },   // coarse, IP-derived; raw IP never stored
  precise?: { lat, lng },                          // rounded to ~110m, precise_location only
  device?:  { browser, platform, ... }             // sanitized, device_profiling only
}
```

The **sessions list** is driven by this `sessions` collection (the authoritative record of
who visited, with consent + geo) and enriched with event-derived stats via a `$lookup`.
Driving from `sessions` rather than a `$group` over events means a session whose events
never arrived (e.g. a lost beacon) still appears instead of vanishing. `sessions` is derived
from the same ingest, so there's no client-driven dual write to keep in sync.

> Events in one delivery batch share a single server receive time. Order within a batch is
> resolved by `_id` (insertion order = the client's enqueue sequence), so the journey
> timeline and entry/exit paths stay correct without trusting the client clock.

### API

| Endpoint | Description |
| --- | --- |
| `POST /api/collect` | Ingest one event or a batch. Accepts JSON or `text/plain` (sendBeacon). Re-checks consent + GPC/DNT, derives+drops the IP to coarse geo, upserts the session. Returns `202 { accepted, rejected }`. |
| `POST /api/session` | Attach Allow-all-tier attributes to a session — sanitized device profile (`device_profiling`) and/or precise location (`precise_location`). Each field enforced against its purpose server-side; anything not consented is dropped. |
| `GET /api/sessions` | Sessions list with per-type counts, duration, consent tier, and geo (`?limit`). |
| `GET /api/sessions/[id]` | One session's ordered event journey. |
| `DELETE /api/sessions/[id]` | Right to erasure. Authorized by the first-party cookie; purges the session's events, session record, and consent-log entries. |
| `GET /api/heatmap?path=…` | Click points for a page; without `path`, the list of pages with click data. |

### Dashboard

- **`/sessions`** — a data table (tabular numerals, monospace ids) of sessions, most recent
  first; click into a session.
- **`/sessions/[id]`** — the user journey as a vertical timeline with behavioral-signal
  badges.
- **`/heatmap`** — a canvas density heatmap, normalized to each visitor's viewport, with a
  legend and a page selector (state lives in the URL).
- **`/audience`** — derived from the `sessions` collection: a Leaflet/OSM **locations map**
  (a bubble per country sized by sessions, plus a heat overlay of consented precise points)
  and **breakdowns** of locations, consent tier, browsers, and platforms. Device and precise
  data appear only for sessions that consented to those purposes.

### Research module

`/research` is the labeled study of invasive techniques. Both demos run entirely in your
browser, transmit nothing, and are never wired into the core pipeline. The page contrasts
each technique with its defenses and repeats the "not used here" note.

## Deployment (AWS App Runner)

The app builds to a standalone Node server and containerizes with the included
`Dockerfile`. App Runner injects `$PORT`, which the server honors.

```bash
docker build -t user-analytics .
docker run -p 3000:3000 -e MONGODB_URI="<your-atlas-uri>" user-analytics
```

To ship on App Runner: push the image to **Amazon ECR**, create an App Runner service from
that image, set `MONGODB_URI` (and optionally `MONGODB_DB`) as runtime environment
variables, and allow your Atlas cluster's network access from the service. App Runner keeps
a persistent Node process, so the single module-level `MongoClient` is reused across
requests (no per-request reconnect).

The GeoLite2 DB is licensed and not committed, so geo is optional: either bake
`GeoLite2-City.mmdb` into the image (and leave `GEOIP_DB_PATH` at its default) or omit it —
without the DB, locations are blank and everything else works unchanged.

## Scaling to ~300M sessions/year

300M sessions/yr is ~10 sessions/sec on average and, at ~20 events each, ~6B events/yr
(~190 events/sec average, perhaps ~10× at peak). The ingest path is the easy part: it's
append-only writes, and the tracker already **batches** events (and uses `sendBeacon`), so
request volume is far lower than event volume. The stateless Node server scales
horizontally behind App Runner; `tracker.js` should sit behind a CDN.

The real work is keeping reads cheap. v2 already takes the first step: a `sessions`
collection holds session-level state, and raw events expire via a **TTL index** (90 days) so
the hot collection stays bounded while sessions persist. At billions of rows I'd push
**pre-aggregation** further — move the per-session event stats off the read-path `$lookup`
into the `sessions` rollup, and bucket heatmap clicks into per-page **grid cells** (e.g.
50×50) via a MongoDB **change stream** or a short batch job, so the dashboard never scans raw
events. For write
distribution at that scale, **shard** on a hashed `sessionId` (even spread, and a session's
events stay co-located). If ingest spikes need smoothing, put a managed queue (Kinesis/SQS)
in front with workers writing in bulk. None of that changes the data model here — it's the
same `events` shape with rollups and lifecycle added.

## Trade-offs & scope

- **Hand-rolled validation** instead of a schema library — small surface, one fewer
  dependency, and full control over stripping unknown fields.
- **A `sessions` collection** upserted from the same ingest (not a separate client write) —
  it carries session-level state that doesn't belong on every event and survives lost
  beacons, without the dual-write bugs of a client-maintained second collection.
- **Local MaxMind GeoLite2** for geo (not a third-party API) — the raw IP never leaves the
  server, and there's no per-request network hop on the hot path.
- **No charting library** — the heatmap is hand-drawn on canvas, which the brief calls for;
  the audience map uses Leaflet over free OSM tiles (no API key).
- **Deliberately out of scope** (wouldn't help here): microservices, Redis, Kafka,
  Kubernetes, auth/multi-tenancy. A simple thing that works flawlessly beats an impressive
  thing that breaks.

## Tests

`npm test` covers the highest-value logic: payload validation (PII-field stripping, meta
sanitization), consent parsing + per-purpose enforcement, the `/api/collect` and
`/api/session` routes (single, batch, malformed body, DNT/GPC and consent handling, with the
data layer mocked), the sessions aggregation pipeline + summary mapping, geo IP selection /
derive-and-drop, country-centroid lookup, and session erasure. Coverage is intentionally
targeted, not exhaustive.

## License

[MIT](./LICENSE).
