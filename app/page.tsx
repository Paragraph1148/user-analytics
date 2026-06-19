import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-wide text-mute">
        Cookieless session analytics
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink text-balance">
        See how people actually use a page.
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-body text-pretty">
        A privacy-forward pipeline that tracks sessions, clicks, and frustration signals —
        then shows them as user journeys and a click heatmap. No cookies for tracking, no
        fingerprinting; it honors Do Not Track and Global Privacy Control.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/sessions"
          className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Open the dashboard
        </Link>
        <Link
          href="/demo"
          className="inline-flex items-center rounded-full border border-hairline bg-canvas px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Try the demo
        </Link>
      </div>

      <hr className="my-12 border-hairline" />

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-canvas p-6">
          <h2 className="text-sm font-medium text-ink">Core pipeline</h2>
          <p className="mt-2 text-sm text-body text-pretty">
            What we&apos;d actually ship: durable first-party session identity, reliable
            delivery, behavioral signals, and a heatmap — built to respect privacy.
          </p>
        </section>
        <section className="rounded-xl border border-hairline bg-canvas p-6">
          <h2 className="text-sm font-medium text-ink">
            Research{" "}
            <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
              study only
            </span>
          </h2>
          <p className="mt-2 text-sm text-body text-pretty">
            A separate, clearly-labeled study of invasive techniques (fingerprinting,
            evercookie) with the defenses that beat them — deliberately not used in the core
            pipeline.{" "}
            <Link
              href="/research"
              className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Read it →
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
