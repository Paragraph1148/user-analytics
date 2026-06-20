import type { Metadata } from "next";
import Script from "next/script";
import ConsentBanner from "./ConsentBanner";

export const metadata: Metadata = {
  title: "Sample page",
  robots: { index: false, follow: false },
};

// A stand-in "customer page": it runs the tracker and shows the consent banner, exactly
// as a real site would. Loaded inside an iframe from /demo so tracking stays scoped here
// and never touches the dashboard. The Nav is hidden on this route (see components/Nav).
const targets = ["Sign up", "Download", "Features", "Pricing", "Docs", "Contact"];

export default function SamplePage() {
  return (
    <>
      <main className="mx-auto max-w-2xl px-6 pb-40 pt-10">
        <p className="font-mono text-xs uppercase tracking-wide text-mute">
          Sample customer page
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          A page being measured
        </h1>
        <p className="mt-3 text-sm leading-6 text-body text-pretty">
          This page runs the analytics tracker behind a consent banner. Nothing is collected
          until you choose below. Once you allow analytics, click the buttons, click the empty
          area, rapid-click one spot, and scroll — then open the dashboard.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {targets.map((label) => (
            <button
              key={label}
              type="button"
              className="rounded-md border border-hairline bg-canvas px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex h-40 items-center justify-center rounded-lg border border-dashed border-hairline-strong/60 bg-canvas-soft text-sm text-mute">
          Empty area — clicks here count as “dead clicks”
        </div>

        <section className="mt-10 space-y-4 text-sm leading-7 text-body">
          <h2 className="text-sm font-medium text-ink">Scroll down for scroll-depth signals</h2>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </p>
          <p>
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
            fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
          </p>
          <p>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
            doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
            veritatis et quasi architecto beatae vitae dicta sunt explicabo.
          </p>
          <p>
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed
            quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque
            porro quisquam est, qui dolorem ipsum quia dolor sit amet.
          </p>
          <p>
            At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis
            praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias
            excepturi sint occaecati cupiditate non provident.
          </p>
        </section>
      </main>

      <ConsentBanner />
      <Script src="/tracker.js" strategy="afterInteractive" />
    </>
  );
}
