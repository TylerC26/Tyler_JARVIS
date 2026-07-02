import Link from "next/link";
import type { Place } from "@/lib/db/types";
import { Panel } from "./Panel";

// The v2 places shortlist — the design's travel slot, backed by the real
// want-to-go list Tyler forwards from Instagram/Threads.
export function PlacesPanel({ places }: { places: Place[] }) {
  const rows = places.slice(0, 4);

  return (
    <Panel
      title="Places"
      count={places.length}
      action={{ href: "/places", label: "All" }}
      emptyState={
        places.length === 0
          ? { show: true, label: "Nothing on the shortlist" }
          : undefined
      }
    >
      <ul className="flex flex-col gap-px overflow-hidden rounded-sm border border-edge/70 bg-edge/70">
        {rows.map((p) => (
          <li key={p.id} className="bg-surface">
            <Link
              href="/places"
              className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2/60"
            >
              <span className="w-16 shrink-0 truncate font-hud text-[10px] uppercase tracking-wider text-accent/80">
                {p.category}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                {p.name}
              </span>
              {p.city && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                  {p.city}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
