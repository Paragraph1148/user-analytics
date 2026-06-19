import type { Metadata } from "next";
import TrackerStatus from "./TrackerStatus";

export const metadata: Metadata = {
  title: "Tracker demo",
  description: "A test page that loads the analytics tracker so you can generate events.",
};

export default function DemoPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wide text-mute">Demo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Tracker demo</h1>
        <p className="text-base text-body">
          The sample page below runs <code className="font-mono">/tracker.js</code> inside an
          iframe — its own document, exactly like the tracker would live on a real customer
          site. That keeps tracking scoped to the sample page and out of this dashboard.
          Interact with it, then view the data in the dashboard.
        </p>
      </header>

      <section className="mt-8">
        <TrackerStatus />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-ink">Sample page (tracked)</h2>
        <iframe
          src="/sample.html"
          title="Sample page with the analytics tracker"
          className="h-[600px] w-full rounded-xl border border-hairline bg-canvas"
        />
      </section>

      <section className="mt-10 text-sm text-body">
        <h2 className="text-sm font-medium text-ink">Verifying it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            In the sample page above: click the buttons, click the empty area (dead clicks),
            click one spot rapidly (rage clicks), and scroll.
          </li>
          <li>
            Open the Network tab and filter for <code className="font-mono">collect</code> —
            events batch and post every few seconds, and flush via{" "}
            <code className="font-mono">sendBeacon</code> when the page is hidden.
          </li>
          <li>
            Open <code className="font-mono">/sessions</code> and{" "}
            <code className="font-mono">/heatmap</code> to see the journey and heatmap.
          </li>
          <li>
            Enable Do Not Track / GPC and reload — the status above flips to off and nothing
            is sent.
          </li>
        </ol>
      </section>
    </main>
  );
}
