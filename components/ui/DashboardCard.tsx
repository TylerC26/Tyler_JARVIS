import Link from "next/link";

type Props = {
  glyph?: string;
  code: string;
  title: string;
  count?: number | string;
  action?: {
    href?: string;
    label: string;
    onClick?: () => void;
  };
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  emptyState?: { show: boolean; label: string; cta?: React.ReactNode };
};

export function DashboardCard({
  glyph,
  code,
  title,
  count,
  action,
  rightSlot,
  children,
  className = "",
  emptyState,
}: Props) {
  const ActionEl = action ? (
    action.href ? (
      <Link
        href={action.href}
        className="font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-accent"
      >
        {action.label} →
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className="font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-accent"
      >
        {action.label} →
      </button>
    )
  ) : null;

  return (
    <section
      className={[
        "scanline-on-hover flex h-full flex-col rounded-md border border-edge bg-surface/70",
        className,
      ].join(" ")}
    >
      <header className="flex items-center justify-between border-b border-edge px-3 py-2">
        <div className="flex items-center gap-2">
          {glyph && (
            <span className="font-mono text-accent text-sm leading-none">
              {glyph}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {code}
          </span>
          <span className="font-mono text-[12px] text-fg">{title}</span>
          {count !== undefined && (
            <span className="ml-1 rounded-sm bg-surface-2 px-1 font-mono text-[10px] tabular text-fg-muted">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
          {ActionEl}
        </div>
      </header>

      <div className="flex-1 p-3">
        {emptyState?.show ? (
          <div className="grid h-full place-items-center py-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-[11px] text-fg-dim">
                {emptyState.label}
              </span>
              {emptyState.cta}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
