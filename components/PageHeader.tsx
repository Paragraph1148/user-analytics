export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-mute">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink text-balance">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-body">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
