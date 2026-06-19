import type { Metadata } from "next";
import { listSessions } from "@/lib/events";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SessionsTable from "@/components/SessionsTable";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = { title: "Sessions" };
export const dynamic = "force-dynamic"; // always reflects the latest events

export default async function SessionsPage() {
  const sessions = await listSessions();
  const count = sessions.length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Dashboard"
        title="Sessions"
        subtitle={
          count === 0
            ? undefined
            : `${formatNumber(count)} ${count === 1 ? "session" : "sessions"}, most recent first.`
        }
      />

      {count === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Open the demo page and click around to generate page views, clicks, and behavioral signals. They'll show up here."
          actionHref="/demo"
          actionLabel="Open the demo"
        />
      ) : (
        <SessionsTable sessions={sessions} />
      )}
    </main>
  );
}
