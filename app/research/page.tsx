import type { Metadata } from "next";
import Link from "next/link";
import FingerprintDemo from "@/components/research/FingerprintDemo";
import EvercookieDemo from "@/components/research/EvercookieDemo";

export const metadata: Metadata = {
  title: "Research",
  description:
    "A labeled study of invasive tracking techniques and the defenses that beat them — deliberately not used in the core pipeline.",
};

export default function ResearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Loud, unmistakable separation from the product. */}
      <div className="rounded-xl border border-signal-dead/40 bg-signal-dead/10 p-5">
        <p className="font-mono text-xs uppercase tracking-wide text-signal-dead">
          Study only — not the product
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink text-balance">
          Invasive tracking techniques, and how privacy tools defeat them
        </h1>
        <p className="mt-3 text-sm leading-6 text-body text-pretty">
          These interactive demos show how invasive tracking actually works, so the
          privacy-forward choices in the core pipeline are concrete rather than abstract.
          They run entirely in your browser, transmit nothing to the server, and are{" "}
          <strong className="font-medium text-ink">deliberately not used</strong> anywhere in
          the real analytics pipeline. That pipeline uses a single random first-party id,
          honors Do Not Track / GPC, and never fingerprints or respawns identifiers.
        </p>
      </div>

      <Technique
        n={1}
        title="Browser fingerprinting"
        howItWorks="Combine passively-available browser attributes — user agent, time zone, screen, GPU, canvas rendering — and hash them into a stable identifier. No storage is written, so it survives clearing cookies and private windows on the same device."
        whyInvasive="The user never consents and can't see or delete the identifier — there's nothing stored to delete. High-entropy signals like the canvas and WebGL renderer make most browsers uniquely identifiable."
        defenses={[
          "Anti-fingerprinting browsers (Tor Browser, Brave, Firefox with resistFingerprinting) normalize or randomize these signals.",
          "Canvas/WebGL prompts or noise injection break the canvas signal.",
          "Reducing entropy: uniform user agents, capped screen/timezone precision.",
          "Because nothing is stored, the only defense is reducing or randomizing the signals themselves.",
        ]}
      >
        <FingerprintDemo />
      </Technique>

      <Technique
        n={2}
        title="Evercookie / identifier respawning"
        howItWorks="Write the same identifier into many storage vectors (cookie, localStorage, sessionStorage, window.name, IndexedDB). Delete one and a script copies a surviving value back into all of them — so partial clearing doesn't work."
        whyInvasive="It defeats the user's intent: clearing cookies (the action most people take) leaves the id alive in vectors they don't know about, and it silently regenerates."
        defenses={[
          "Clear all site data at once (browsers' “Clear site data”), not just cookies.",
          "Private/incognito windows discard every vector on close.",
          "Storage partitioning and total cookie protection isolate vectors per site.",
          "Extensions and hardened browsers block known respawning patterns.",
        ]}
      >
        <EvercookieDemo />
      </Technique>

      <p className="mt-12 text-sm text-body">
        Back to what we&apos;d actually ship:{" "}
        <Link
          href="/sessions"
          className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          the dashboard
        </Link>
        .
      </p>
    </main>
  );
}

function Technique({
  n,
  title,
  howItWorks,
  whyInvasive,
  defenses,
  children,
}: {
  n: number;
  title: string;
  howItWorks: string;
  whyInvasive: string;
  defenses: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <p className="font-mono text-xs uppercase tracking-wide text-mute">Technique {n}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-body text-pretty">{howItWorks}</p>

      <div className="mt-5 rounded-xl border border-hairline bg-canvas p-5">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-wide text-mute">
          Live demo
        </p>
        {children}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-ink">Why it&apos;s invasive</h3>
          <p className="mt-2 text-sm leading-6 text-body text-pretty">{whyInvasive}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink">How privacy tools defeat it</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-body">
            {defenses.map((d) => (
              <li key={d} className="flex gap-2">
                <span aria-hidden className="text-signal-cool">
                  ✓
                </span>
                <span className="text-pretty">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 border-l-2 border-signal-dead/50 bg-canvas-soft py-2 pl-3 text-sm text-body">
        <strong className="font-medium text-ink">Not used in the core pipeline.</strong> The
        production tracker relies on a random first-party id only.
      </p>
    </section>
  );
}
