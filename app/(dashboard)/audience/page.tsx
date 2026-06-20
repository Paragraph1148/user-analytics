import type { Metadata } from "next";
import { countSessions, getPrecisePoints, sessionBreakdown } from "@/lib/sessions";
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Breakdown from "@/components/Breakdown";
import LocationsMap from "@/components/map/LocationsMap";

export const metadata: Metadata = { title: "Audience" };
export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const total = await countSessions();

  if (total === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <PageHeader eyebrow="Dashboard" title="Audience" />
        <EmptyState
          title="No audience data yet"
          description="Location, device, and consent breakdowns appear once sessions are recorded. Open the demo and accept analytics to generate some."
          actionHref="/demo"
          actionLabel="Open the demo"
        />
      </main>
    );
  }

  const [countries, browsers, platforms, consent, points] = await Promise.all([
    sessionBreakdown("geo.country"),
    sessionBreakdown("device.browser"),
    sessionBreakdown("device.platform"),
    sessionBreakdown("consent.tier"),
    getPrecisePoints(),
  ]);

  // Place a bubble per country with a known centroid (coarse data → always populated).
  const bubbles = countries
    .filter((c) => COUNTRY_CENTROIDS[c.value])
    .map((c) => {
      const [lat, lng] = COUNTRY_CENTROIDS[c.value];
      return { lat, lng, label: c.value, sessions: c.sessions };
    });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Dashboard"
        title="Audience"
        subtitle="Where visitors are, what they use, and what they consented to — derived from sessions."
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-ink">Locations map</h2>
        <p className="mb-3 text-xs text-mute">
          Bubbles sized by sessions per country (coarse, from IP). Precise points consented to
          precise location appear as a heat overlay.
        </p>
        <LocationsMap bubbles={bubbles} points={points} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown
          title="Locations"
          subtitle="By country (coarse, from IP — Necessary tier)."
          items={countries}
          mono
        />
        <Breakdown title="Consent" subtitle="Chosen tier per session." items={consent} mono />
        <Breakdown
          title="Browsers"
          subtitle="From device details (Allow-all tier)."
          items={browsers}
        />
        <Breakdown
          title="Platforms"
          subtitle="From device details (Allow-all tier)."
          items={platforms}
        />
      </div>

      <p className="mt-6 text-xs text-mute">
        Device and precise data appear only for sessions that consented to those purposes.
      </p>
    </main>
  );
}
