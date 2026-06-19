# frontend-guidelines.md

Read this before building any UI. `DESIGN.md` (Vercel) and the `web-design-guidelines`
skill are the general design authority — monochrome precision, Geist, restraint. This file
adds only the **project-specific direction** for a behavioral-analytics tool. On general
aesthetic, DESIGN.md wins; on what's specific to this product, this file wins.

## Project-specific direction
The subject is dense, factual behavioral data — sessions, clicks, heat — so lean into the
"instrument panel / observability console" reading that DESIGN.md's precision already implies:
- **Data reads like data.** All numbers, IDs, timestamps, and coordinates in a monospace
  (Geist Mono pairs with DESIGN.md's Geist). Use tabular numbers in tables.
- **Layout.** Sessions as a real data table (aligned columns), the user-journey as a clear
  vertical timeline (order *is* the information), the heatmap as the visual centerpiece.
- **Signature element: the heatmap.** Spend your boldness here — a genuinely good canvas
  density gradient normalized to viewport size, with a legend. Keep everything around it quiet.
- **Styling is Tailwind v4** (CSS-first `@theme`, no config file) — consult the `tailwind-4-docs`
  skill; don't write v3 syntax.

## Next.js / Vercel conventions
- **App Router. Server Components by default.** Use Client Components (`"use client"`) only
  where you need interactivity: the heatmap canvas, the session-detail interactions, any live
  updates, the research-module demos.
- Fetch data in Server Components / route handlers; don't ship data-fetching logic to the client
  unnecessarily. Keep the client bundle small.
- Use `loading.tsx` and `error.tsx` for route-level loading and error states.
- Co-locate components with routes; keep shared UI in a `components/` dir.

## Quality floor (non-negotiable, build it in quietly)
- Responsive down to mobile.
- Visible keyboard focus on every interactive element.
- `prefers-reduced-motion` respected — and go light on animation generally; scattered
  effects read as AI-generated. One considered moment beats many.
- **Empty, loading, and error states for every data view.** An analytics dashboard with no
  data yet is the *first* thing the reviewer sees — an empty state is an invitation to act
  ("No sessions yet — open the demo page and click around"), not a blank screen.

## Microcopy
- Plain language, active voice, sentence case. Name things by what the user sees
  ("Sessions", "Clicks", "User journey"), not by how the system is built.
- Errors explain what happened and how to fix it, in the interface's voice — never vague,
  never apologetic.
- Every label does exactly one job. No filler.
