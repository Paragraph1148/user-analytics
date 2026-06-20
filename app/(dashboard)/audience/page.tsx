import type { Metadata } from "next";
import { countSessions, sessionBreakdown } from "@/lib/sessions";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Breakdown from "@/components/Breakdown";

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

  const [countries, browsers, platforms, consent] = await Promise.all([
    sessionBreakdown("geo.country"),
    sessionBreakdown("device.browser"),
    sessionBreakdown("device.platform"),
    sessionBreakdown("consent.tier"),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Dashboard"
        title="Audience"
        subtitle="Where visitors are, what they use, and what they consented to — derived from sessions."
      />

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
