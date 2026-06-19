import EmptyState from "@/components/EmptyState";

export default function SessionNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <EmptyState
        title="Session not found"
        description="This session has no recorded events. It may have expired or never existed."
        actionHref="/sessions"
        actionLabel="Back to sessions"
      />
    </main>
  );
}
