"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-xl border border-hairline bg-canvas p-8">
        <p className="font-mono text-xs uppercase tracking-wide text-signal-rage">Error</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">Couldn&apos;t load this view</h1>
        <p className="mt-2 text-sm text-body">
          The data store didn&apos;t respond. Check the database connection and try again.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-mute">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
