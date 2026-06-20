# User Analytics

Privacy-forward, cookieless session analytics. It tracks how people use a page —
page views, clicks, and frustration signals — and shows them as **user journeys** and a
**click heatmap**. Built as a take-home for the CausalFunnel Full Stack Engineer role.

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
- **MongoDB Atlas** via the official `mongodb` driver — one `events` collection; sessions
  are derived by aggregation.
- **Tailwind CSS v4** (CSS-first `@theme`, no config file), Geist + Geist Mono.
- **Vitest** for unit tests.
- **Docker** standalone image for **AWS App Runner**.

## Getting started

Prerequisites: Node 20+ and a MongoDB Atlas connection string (free tier is fine).

```bash
npm install
cp .env.example .env.local        # then fill in MONGODB_URI
npm run dev                        # http://localhost:3000
```

Then open **`/demo`**, click around (and scroll) to generate events, and view them in the
dashboard at **`/sessions`** and **`/heatmap`**.

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

One collection, `events`:

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
`{ ts: -1 }` (recent). The **sessions list** is derived with a `$group` aggregation rather
than a second collection — simpler, and no dual-write bugs.

> Events in one delivery batch share a single server receive time. Order within a batch is
> resolved by `_id` (insertion order = the client's enqueue sequence), so the journey
> timeline and entry/exit paths stay correct without trusting the client clock.

### API

| Endpoint | Description |
| --- | --- |
| `POST /api/collect` | Ingest one event or a batch. Accepts JSON or `text/plain` (sendBeacon). Returns `202 { accepted, rejected }`. |
| `GET /api/sessions` | Sessions list with per-type counts and duration (`?limit`). |
| `GET /api/sessions/[id]` | One session's ordered event journey. |
| `GET /api/heatmap?path=…` | Click points for a page; without `path`, the list of pages with click data. |

### Dashboard

- **`/sessions`** — a data table (tabular numerals, monospace ids) of sessions, most recent
  first; click into a session.
- **`/sessions/[id]`** — the user journey as a vertical timeline with behavioral-signal
  badges.
- **`/heatmap`** — a canvas density heatmap, normalized to each visitor's viewport, with a
  legend and a page selector (state lives in the URL).

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

## Scaling to ~300M sessions/year

300M sessions/yr is ~10 sessions/sec on average and, at ~20 events each, ~6B events/yr
(~190 events/sec average, perhaps ~10× at peak). The ingest path is the easy part: it's
append-only writes, and the tracker already **batches** events (and uses `sendBeacon`), so
request volume is far lower than event volume. The stateless Node server scales
horizontally behind App Runner; `tracker.js` should sit behind a CDN.

The real work is keeping reads cheap. The on-the-fly sessions `$group` is fine for a
take-home but won't hold at billions of rows, so I'd move to **pre-aggregation**: roll
events into a `sessions` summary collection and per-page heatmap **grid buckets** (e.g.
50×50 cells) via a MongoDB **change stream** or a short batch job, and serve the dashboard
from those rollups instead of scanning raw events. Raw events get a **TTL index** (say
90 days) so the hot collection stays bounded while aggregates persist. For write
distribution at that scale, **shard** on a hashed `sessionId` (even spread, and a session's
events stay co-located). If ingest spikes need smoothing, put a managed queue (Kinesis/SQS)
in front with workers writing in bulk. None of that changes the data model here — it's the
same `events` shape with rollups and lifecycle added.

## Trade-offs & scope

- **Hand-rolled validation** instead of a schema library — small surface, one fewer
  dependency, and full control over stripping unknown fields.
- **Derived sessions** (aggregation) over a second collection — avoids dual-write bugs.
- **No charting library** — the heatmap is hand-drawn on canvas, which the brief calls for.
- **Deliberately out of scope** (wouldn't help here): microservices, Redis, Kafka,
  Kubernetes, auth/multi-tenancy. A simple thing that works flawlessly beats an impressive
  thing that breaks.

## Tests

`npm test` covers the highest-value logic: payload validation (including PII-field
stripping and meta sanitization), the `/api/collect` route (single, batch, malformed body,
and DNT/GPC handling, with the data layer mocked), and the sessions aggregation pipeline +
summary mapping. Coverage is intentionally targeted, not exhaustive.

## License

[MIT](./LICENSE).
