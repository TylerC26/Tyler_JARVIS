import Link from "next/link";
import type { Place } from "@/lib/db/types";
import { Panel } from "./Panel";

const CATEGORY_TONE: Record<string, string> = {
  restaurant: "bg-accent/10 text-accent",
  cafe: "bg-warn/10 text-warn",
  bar: "bg-info/10 text-info",
  dessert: "bg-danger/10 text-danger",
  activity: "bg-success/10 text-success",
  other: "bg-surface-2 text-fg-muted",
};

export function TerminalPlaces({ places }: { places: Place[] }) {
  const rows = places.slice(0, 5);

  return (
    <Panel
      title="Places"
      count={places.length}
      action={{ href: "/places", label: "All places" }}
      emptyState={
        rows.length === 0
          ? { show: true, label: "No places saved yet" }
          : undefined
      }
    >
      <ul className="flex flex-col">
        {rows.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2.5 border-b border-edge/60 py-2 last:border-0"
          >
            <span
              className={[
                "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                CATEGORY_TONE[p.category] ?? "bg-surface-2 text-fg-muted",
              ].join(" ")}
            >
              {p.category}
            </span>
            <Link
              href="/places"
              className="flex-1 truncate text-sm text-fg-muted transition-colors hover:text-fg"
              title={p.name}
            >
              {p.name}
              {p.city ? <span className="text-fg-dim"> · {p.city}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
