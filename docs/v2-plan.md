# v2 — Consented analytics (phased plan)

v2 evolves the privacy-forward v1 into a **consent-driven** product: richer data
(precise location, high-entropy device profile, element-level interaction analytics) but
only with informed, granular, revocable consent — enforced end to end.

## Guiding principles
- **Privacy through control, not avoidance.** Consent is real and enforced, not cosmetic.
- **Opt-in before collection.** Nothing identifiable is collected until the user chooses;
  pre-consent events are dropped, not buffered.
- **GPC/DNT is a hard override** above the banner (already honored server-side in v1).
- **Data minimization:** derive-and-drop the raw IP (store only coarse geo); round precise
  coordinates; TTL raw events.
- **Server enforces the consent contract** — the client states its tier/purposes; the
  server independently drops anything not permitted.
- **The line we won't cross even with consent:** evercookie *respawning* stays study-only
  (it fights the right to withdraw). High-entropy device profiling + a fingerprint *as a
  signal* are allowed under explicit consent.

## Workflow / safety
- Developed on the **`v2` branch**; `main` + the live App Runner URL remain v1 until v2 is
  verified, then merge + redeploy.
- Same cadence as v1: propose → approve each phase → build → verify (tsc/lint/test/build +
  live-Atlas check) → commit → stop for review.

## Data model changes
- **`sessions` collection** (upserted on session start / consent change): mutable/stable
  per-session state — `consent {tier, version, purposes, ts}`, `geo {country, region,
  source, lat?, lng?}`, `device {…}`, `firstSeen/lastSeen`. Events stay append-only.
- **`consent_log` collection**: append-only audit record (granted/changed/withdrawn, tier,
  version, ts) — the GDPR "record of consent."
- **`events`**: a non-PII `element` descriptor on clicks; consent enforced at write time.
- **TTL index** on `events` (retention).
- **Purposes:** `analytics` (behavioral + coarse geo = the Necessary set),
  `precise_location`, `device_profiling`.

## Open decision
- **Geo source.** App Runner emits no geo header, so options are: (a) bundle **MaxMind
  GeoLite2** in the image and look up the IP (works as-is; free account + attribution) —
  **chosen default**; (b) front with CloudFront for `CloudFront-Viewer-Country`; (c) an
  external IP-geo API. Default: (a).

---

## Phase 1 — Consent foundation (the spine)
- Consent model + state machine: **Necessary / Allow all / Manage** (per-purpose toggles);
  versioned (policy-version bump re-prompts); stored first-party (localStorage + cookie).
- Precedence: **GPC/DNT → forced opt-out**; otherwise unknown → banner → choice; withdraw
  or change anytime.
- Bottom **consent banner** + "Manage preferences" panel (real GDPR UX: specific purposes,
  no pre-ticked "all," easy withdrawal).
- **Tracker is consent-aware:** collects nothing until consent, reconfigures live on change.
- **Server enforcement** in `/api/collect` (extends the v1 DNT/GPC check) + **consent audit
  log** (`/api/consent` → `consent_log`).

## Phase 2 — Session record + Necessary-tier geo
- Introduce the **`sessions` collection**; wire session attributes into reads.
- **Coarse IP geo, derive-and-drop** (GeoLite2): resolve country/region server-side from
  `X-Forwarded-For`; store geo, never persist the raw IP.

## Phase 3 — Allow-all tier: high-entropy device + precise location
- **Device profiling (about:support-level)** via UA-Client-Hints high-entropy values +
  WebGL/GPU/screen/hardware/network — gated by `device_profiling`.
- **Precise `navigator.geolocation`** (gated by `precise_location`), with **coarse IP geo as
  the automatic fallback** when permission is denied or the fetch fails. Coordinates
  rounded. Demo iframe gets `allow="geolocation"`.

## Phase 4 — Element-level + scroll analytics (the v1 gap)
- Capture a **non-PII element descriptor** (visible label / role / tag / stable `data-track`
  selector — site UI, not user input) → **"most-clicked elements"** + per-element counts.
- **Scroll-depth distribution** view; add max-scroll-depth to the session view.

## Phase 5 — Data-subject rights + compliance
- **Withdrawal** that stops collection **and purges** the session's data.
- **`DELETE /api/sessions/[id]`** deletion endpoint + a self-serve "delete my data"
  affordance keyed off the first-party id.
- **Retention TTL** on `events`.
- Surface each session's **consent tier** in the dashboard; README "Privacy & GDPR" section.

## Phase 6 — Geo/device dashboards + research reframe + ship
- **Locations** (country/region breakdown; optional map) and **device breakdown** views.
- **Rewrite `/research`**: "what we now do *with* consent vs. what we still refuse"
  (evercookie respawn stays study-only).
- Build + push v2 image → `start-deployment` on App Runner; update README; record video.
