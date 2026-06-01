import Link from "next/link";

type PanelAction = {
  href?: string;
  label: string;
  onClick?: () => void;
};

type Props = {
  title: string;
  count?: number | string;
  action?: PanelAction;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  emptyState?: { show: boolean; label: string; cta?: React.ReactNode };
};

// The dashboard's modern card shell. Refined-dark chrome (rounded, hairline
// border, calm surface, subtle hover) with a clean sans-serif header — the
// non-terminal counterpart to the shared components/ui/DashboardCard, scoped to
// the dashboard so the rest of the app's aesthetic is untouched.
export function Panel({
  title,
  count,
  action,
  rightSlot,
  children,
  className = "",
  bodyClassName = "",
  emptyState,
}: Props) {
  const actionInner = action ? (
    <>
      <span>{action.label}</span>
      <span aria-hidden className="transition-transform group-hover/act:translate-x-0.5">
        →
      </span>
    </>
  ) : null;

  const ActionEl = action ? (
    action.href ? (
      <Link
        href={action.href}
        className="group/act inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        {actionInner}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className="group/act inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        {actionInner}
      </button>
    )
  ) : null;

  return (
    <section
      className={[
        "flex h-full flex-col rounded-xl border border-edge bg-surface transition-colors hover:border-edge-strong",
        className,
      ].join(" ")}
    >
      <header className="flex items-center gap-2.5 px-4 pb-3 pt-3.5">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular text-fg-muted">
            {count}
          </span>
        )}
        {(rightSlot || ActionEl) && (
          <div className="ml-auto flex items-center gap-3">
            {rightSlot}
            {ActionEl}
          </div>
        )}
      </header>

      <div className={["flex-1 px-4 pb-4", bodyClassName].join(" ")}>
        {emptyState?.show ? (
          <div className="grid h-full place-items-center py-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <span className="text-[13px] text-fg-dim">{emptyState.label}</span>
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
