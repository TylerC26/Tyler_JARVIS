import Link from "next/link";
import { HudFrame } from "./HudFrame";

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

// The dashboard's HUD card shell. A glassy gradient slab framed by a charged
// top edge, four targeting-bracket corners, a CRT scanline wash and a hover
// interrogation sweep (all from HudFrame + the .hud-panel chrome in globals).
// The header reads like a tactical readout: a glowing index tick, an uppercase
// Chakra-Petch label and a bracketed count.
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
        className="group/act inline-flex items-center gap-1 font-hud text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-accent"
      >
        {actionInner}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        className="group/act inline-flex items-center gap-1 font-hud text-[10px] uppercase tracking-wider text-fg-muted transition-colors hover:text-accent"
      >
        {actionInner}
      </button>
    )
  ) : null;

  return (
    <section
      className={[
        "hud-panel crt-scanlines group flex h-full flex-col overflow-hidden rounded-lg border border-edge/90 transition-colors hover:border-accent/35",
        className,
      ].join(" ")}
    >
      <HudFrame />

      <header className="relative z-10 flex items-center gap-2.5 border-b border-edge/50 px-4 pb-2.5 pt-3">
        <span
          aria-hidden
          className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
        />
        <h2 className="font-hud text-[12px] font-semibold uppercase tracking-[0.18em] text-fg">
          {title}
        </h2>
        {count !== undefined && (
          <span className="rounded-sm border border-accent/25 bg-accent/5 px-1.5 py-0.5 font-mono text-[10px] tabular text-accent/90">
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

      <div className={["relative z-10 flex-1 px-4 pb-4 pt-3", bodyClassName].join(" ")}>
        {emptyState?.show ? (
          <div className="grid h-full place-items-center py-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <span className="font-hud text-[11px] uppercase tracking-wider text-fg-dim">
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
