export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12" aria-busy="true">
      <div className="h-3 w-24 rounded bg-canvas-soft-2" />
      <div className="mt-3 h-8 w-48 rounded bg-canvas-soft-2" />
      <div className="mt-8 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-canvas-soft-2" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
