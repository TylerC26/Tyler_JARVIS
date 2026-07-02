import Link from "next/link";

export type StatCell = {
  label: string;
  value: string;
  sub: string;
  /** Tailwind text-* class for the value; defaults to plain fg. */
  tone?: string;
  /** Tailwind text-* class for the sub line; defaults to dim. */
  subTone?: string;
  href: string;
};

// The at-a-glance strip under the greeting: six hairline-separated counters
// (the 1px gaps read as etched dividers against the edge-colored backdrop).
export function StatRibbon({ cells }: { cells: StatCell[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-edge/90 bg-edge/90 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="group bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2/80"
        >
          <div className="font-hud text-[10px] uppercase tracking-[0.15em] text-fg-dim">
            {c.label}
          </div>
          <div
            className={[
              "mt-1.5 font-display text-[22px] font-semibold leading-none tabular",
              c.tone ?? "text-fg",
            ].join(" ")}
          >
            {c.value}
          </div>
          <div
            className={[
              "mt-1.5 truncate font-mono text-[10px]",
              c.subTone ?? "text-fg-dim",
            ].join(" ")}
          >
            {c.sub}
          </div>
        </Link>
      ))}
    </div>
  );
}
