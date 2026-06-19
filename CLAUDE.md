# CLAUDE.md — User Analytics Application

## What this is
A take-home for the CausalFunnel Full Stack Engineer role. Build a small full-stack
app that tracks user interactions on a webpage and shows them in a dashboard
(sessions view + click heatmap). Deadline is tight (72h). Quality of judgment matters
more than feature count.

**Read `frontend-guidelines.md` before doing any UI work.**

## The one architectural decision that defines this submission
CausalFunnel's product is **cookieless, privacy-conscious** session analytics. So this
build has two clearly separated parts:

1. **The core pipeline = privacy-forward.** Durable first-party session identity, no
   invasive tracking, respects user privacy signals. This is what we'd actually ship.
2. **A separate, clearly-labeled `/research` module = a study of invasive techniques**
   (fingerprinting, evercookie-style respawning) implemented as demos *only*, each
   paired with how privacy tools defeat it and an explicit note that it is deliberately
   NOT used in the core pipeline.

This pairing is the whole point: it shows we understand the invasive end of the
spectrum AND made a deliberate, privacy-respecting engineering choice. Do not blur
these two parts together.

## Stack & structure (default: single Next.js app)
- **Next.js 16 (App Router) + React + TypeScript**, route handlers (`app/api/...`) as the backend. (Next 16 is required for the Next.js MCP below.)
- **MongoDB Atlas** (free tier) via the official `mongodb` driver.
- **Deploy target: AWS.** Containerize the app (`next build` + `next start`) and run it on
  App Runner or an EC2 instance. Goal is a persistent Node server (see Mongo note below).
- **Tailwind CSS v4** — CSS-first config: `@import "tailwindcss"` plus a `@theme` block in
  `globals.css`. There is NO `tailwind.config.js` by default. Consult the `tailwind-4-docs`
  skill before writing any Tailwind; do not assume v3 syntax.
- **Design language:** `DESIGN.md` (Vercel — monochrome precision, Geist) and the
  `web-design-guidelines` skill are the authority for general design. `frontend-guidelines.md`
  adds the project-specific direction. Do NOT ship the generic AI-dashboard look.
- **Tooling:** use the Next.js MCP (`next-devtools`, configured in `.mcp.json`) to query the
  running dev server for build/runtime/type errors and fix them.

```
app/
  api/
    collect/route.ts        # POST: receive events (single + batch, sendBeacon)
    sessions/route.ts       # GET: list sessions with event counts
    sessions/[id]/route.ts  # GET: ordered events for one session (user journey)
    heatmap/route.ts        # GET ?url=...: click coords for a page
  (dashboard)/              # sessions view + heatmap view
  research/                 # labeled study module (fingerprinting/evercookie demos + writeup)
  demo/                     # simple test page that loads the tracker
lib/
  db.ts                     # cached Mongo client (serverless-safe, see note)
  events.ts                 # data-access / aggregation logic
  validation.ts             # event payload validation
public/
  tracker.js                # the embeddable tracking script
Dockerfile                  # `next start` (output: standalone) for AWS App Runner; honor PORT
.mcp.json                   # Next.js devtools MCP (next-devtools-mcp)
DESIGN.md                   # Vercel design language (installed via `npx getdesign add vercel`)
```

> **Mongo connection note:** as a persistent server (App Runner/EC2), create a single
> module-level `MongoClient` once and reuse it — do not reconnect per request. (The
> global-cache / cached-promise pattern is only needed on serverless targets like
> Vercel or Amplify SSR.)

## Data model
One primary collection: **`events`**.
```
{
  sessionId: string,        // first-party id
  type: "page_view" | "click" | "rage_click" | "scroll" | ...,
  url: string,              // full URL
  path: string,             // pathname (index this for heatmap-by-page)
  ts: Date,
  x?: number, y?: number,   // click coords (page-relative)
  vpW?: number, vpH?: number, // viewport, so the heatmap can normalize across screens
  referrer?: string,
  meta?: object
}
```
Indexes: `{ sessionId: 1, ts: 1 }`, `{ path: 1, type: 1 }`, `{ ts: -1 }`.
Derive the **sessions list** with a `$group` aggregation over `events` (count, firstSeen,
lastSeen) rather than maintaining a second collection — simpler and avoids dual-write bugs.

## Privacy = hard requirements (these are non-negotiable in the core pipeline)
- **Respect `navigator.doNotTrack` and `navigator.globalPrivacyControl` (GPC).** If either
  is set, do not collect. Surface this in the README.
- **First-party session id only:** localStorage primary, first-party cookie fallback, handle
  the case where one is cleared. NO fingerprinting / NO evercookie in the core pipeline.
- **No PII:** never capture input values, typed text, or anything identifying. Clicks are
  coordinates + element type, nothing more.

## Targeted x+1 (depth in the RIGHT places — do these, skip everything else)
- Durable first-party session identity (above).
- **Reliable delivery:** `navigator.sendBeacon` for unload + a small in-memory queue with
  retry so events aren't lost. (Harder to *lose*, not harder to *block*.)
- **Richer behavioral signals:** rage clicks (rapid repeated clicks in a small area =
  frustration), dead clicks, scroll depth, time-on-page. This is the behavioral insight
  their product is actually about.
- **A real heatmap:** canvas density gradient, normalized to viewport size, with a legend —
  not just scattered dots.

## Scope discipline (do NOT do these)
- ❌ Microservices, Redis, Kafka/queues, Kubernetes, auth/multi-tenancy. None help here.
- ❌ Over-building any one dimension into the ground.
- ✅ A simple thing that works flawlessly in the demo beats an impressive thing that breaks.
  The hosted demo must not break when the reviewer clicks around. Protect that above all.

## Build in phases — propose a plan and get it approved before coding each phase
1. Repo + `lib/db.ts` + `events` schema/indexes + `/api/collect` (accept single + batch).
2. `tracker.js`: session id, page_view + click capture, sendBeacon + queue, DNT/GPC guard. `/demo` page to test it end-to-end.
3. Behavioral signals (rage/dead clicks, scroll depth) + the read APIs (sessions, session events, heatmap).
4. Dashboard: sessions list → click into ordered user journey; heatmap view (canvas) with page selector.
5. `/research` module + writeup (fingerprinting + evercookie demos, defenses, "not used here" note).
6. README (setup, stack, trade-offs, a "scaling to ~300M sessions/yr" paragraph), polish, host, record video.

## Conventions
- TypeScript strict. Validate all incoming event payloads; never trust the client.
- Small, readable functions. Comments only where intent isn't obvious.
- A couple of API tests on `/api/collect` and the sessions aggregation are worth it; don't chase coverage.
- After each phase, run `npm run dev` and use the Next.js MCP (`next-devtools` → `get_errors`)
  to catch build/runtime/type errors before moving on; fix them, then commit with a clear message.

## Commands
- `npm run dev` — local dev
- `npm run build` — production build (run before deploying)
- `npm test` — tests
