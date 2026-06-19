import Link from "next/link";

// An empty data view is the first thing a reviewer sees, so it's an invitation to act,
// never a blank screen (see frontend-guidelines.md).
export default function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-hairline-strong/60 bg-canvas-soft p-12 text-center">
      <h2 className="text-base font-medium text-ink text-balance">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-body text-pretty">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
