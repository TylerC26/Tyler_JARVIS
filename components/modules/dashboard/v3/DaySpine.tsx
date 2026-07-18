"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/date";
import type { Event } from "@/lib/db/types";

function durationMin(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

function relative(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h${m}m`;
}

// The v3 "day spine": today's timed events on a single vertical rail, the live
// row (running event, else next up) spotlit in accent.
export function DaySpine({ events }: { events: Event[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const timed = useMemo(
    () =>
      events
        .filter((e) => !e.all_day)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [events],
  );

  const currentIdx = useMemo(() => {
    if (!now) return -1;
    return timed.findIndex(
      (e) =>
        +new Date(e.starts_at) <= now.getTime() &&
        +new Date(e.ends_at) >= now.getTime(),
    );
  }, [timed, now]);

  const nextIdx = useMemo(() => {
    if (!now) return -1;
    return timed.findIndex((e) => +new Date(e.starts_at) > now.getTime());
  }, [timed, now]);

  const liveIdx = currentIdx !== -1 ? currentIdx : nextIdx;

  return (
    <section className="overflow-hidden rounded-md border border-edge bg-surface">
      <div className="flex items-center gap-2.5 border-b border-edge px-4 py-3">
        <span className="font-hud text-[11px] uppercase tracking-[0.16em] text-fg-dim">
          // Day spine
        </span>
        <span className="ml-auto rounded-sm border border-accent/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
          {timed.length} {timed.length === 1 ? "event" : "events"}
        </span>
      </div>

      {timed.length === 0 ? (
        <div className="px-4 py-6 text-center font-mono text-[11px] text-fg-dim">
          Nothing scheduled today
        </div>
      ) : (
        <div className="relative px-4 py-4">
          {/* rail */}
          <div className="absolute bottom-4 left-[74px] top-5 w-px bg-edge" aria-hidden />
          <ul className="flex flex-col gap-3.5">
            {timed.map((e, i) => {
              const isPast = now ? +new Date(e.ends_at) < now.getTime() : false;
              const isCurrent = i === currentIdx;
              const isLive = i === liveIdx;
              const mins = now ? durationMin(e.starts_at, e.ends_at) : 0;
              const rel =
                now && !isPast
                  ? relative(Math.round((+new Date(e.starts_at) - now.getTime()) / 60000))
                  : isPast
                    ? "done"
                    : "";
              const metaBits = [
                rel,
                mins ? `${mins} min` : null,
                e.category ? e.category.toUpperCase() : null,
              ].filter(Boolean);

              return (
                <li key={e.id} className="flex items-start gap-3">
                  <span
                    className={[
                      "w-10 shrink-0 text-right font-mono text-[11px] tabular",
                      isLive ? "text-accent" : "text-fg-muted",
                    ].join(" ")}
                  >
                    {fmtDate(e.starts_at, "HH:mm")}
                  </span>
                  <span
                    className={[
                      "z-[1] mt-[3px] size-2.5 shrink-0 rotate-45",
                      isCurrent
                        ? "bg-accent shadow-[0_0_8px_var(--color-accent)]"
                        : isLive
                          ? "border border-accent bg-surface"
                          : isPast
                            ? "bg-fg-dim/50"
                            : "border border-fg-dim bg-surface",
                    ].join(" ")}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href="/calendar"
                      className={[
                        "block truncate text-[12px] transition-colors hover:text-fg",
                        isLive ? "text-fg" : isPast ? "text-fg-dim line-through" : "text-fg-muted",
                      ].join(" ")}
                      title={e.title}
                    >
                      {e.title}
                    </Link>
                    {metaBits.length > 0 && (
                      <div className="mt-0.5 truncate font-mono text-[10px] text-fg-dim">
                        {metaBits.join(" · ")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
