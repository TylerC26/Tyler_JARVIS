import Link from "next/link";
import type { Place } from "@/lib/db/types";

const CATEGORY_TONE: Record<string, string> = {
  restaurant: "text-accent",
  cafe: "text-warn",
  bar: "text-info",
  dessert: "text-danger",
  activity: "text-success",
  other: "text-fg-dim",
};

export function TerminalPlaces({ places }: { places: Place[] }) {
  const rows = places.slice(0, 5);

  return (
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <Link href="/places" className="phosphor text-accent hover:underline">
          places&gt;
        </Link>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          {places.length} want-to-go
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="pl-6 text-fg-dim">
          // no places yet — forward an Instagram post to Jarvis on Telegram.
        </div>
      ) : (
        <ul className="pl-6">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-baseline gap-2 text-fg-muted"
            >
              <span className="w-3 shrink-0 text-fg-dim" aria-hidden>
                ·
              </span>
              <span
                className={[
                  // Wide enough to contain "[RESTAURANT]" (the longest
                  // category tag) so the closing bracket never runs into
                  // the venue name.
                  "w-28 shrink-0 text-[10px] uppercase tracking-wider",
                  CATEGORY_TONE[p.category] ?? "text-fg-dim",
                ].join(" ")}
              >
                [{p.category}]
              </span>
              <Link
                href="/places"
                className="flex-1 truncate hover:text-accent"
                title={p.name}
              >
                {p.name}
                {p.city ? (
                  <span className="text-fg-dim"> — {p.city}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
