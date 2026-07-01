// Bordered panel used by the right-hand workspace rail (Board / Milestones /
// Software) in the v2 project layout. A `// LABEL` eyebrow header with an
// optional count badge and a right-aligned action slot, then the body.

export function RailCard({
  label,
  badge,
  action,
  children,
  bodyClassName = "",
}: {
  label: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-md border border-edge bg-surface/40">
      <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </span>
        {badge}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className={bodyClassName || "p-3.5"}>{children}</div>
    </section>
  );
}
