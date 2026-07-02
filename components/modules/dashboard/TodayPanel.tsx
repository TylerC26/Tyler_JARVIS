"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/date";
import type { Event } from "@/lib/db/types";
import { Panel } from "./Panel";

function minsUntil(iso: string, now: Date) {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
}

function relative(mins: number): string {
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h${m}m`;
}

// The v2 today timeline: a vertical schedule where the live row (current
// event, or next up when nothing is running) is spotlit with an accent rail.
export function TodayPanel({
  events,
  className,
}: {
  events: Event[];
  className?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { allDay, timed } = useMemo(() => {
    const ad = events.filter((e) => e.all_day);
    const t = events
      .filter((e) => !e.all_day)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
    return { allDay: ad, timed: t };
  }, [events]);

  const currentIdx = useMemo(() => {
    if (!now) return -1;
    return timed.findIndex(
      (e) =>
        new Date(e.starts_at).getTime() <= now.getTime() &&
        new Date(e.ends_at).getTime() >= now.getTime(),
    );
  }, [timed, now]);

  const nextIdx = useMemo(() => {
    if (!now) return -1;
    return timed.findIndex(
      (e) => new Date(e.starts_at).getTime() > now.getTime(),
    );
  }, [timed, now]);

  // One spotlit row: the running event, else the next one up.
  const liveIdx = currentIdx !== -1 ? currentIdx : nextIdx;

  return (
    <Panel
      title="Today"
      count={events.length}
      action={{ href: "/calendar", label: "Calendar" }}
      className={className}
      emptyState={
        events.length === 0
          ? { show: true, label: "Nothing scheduled today" }
          : undefined
      }
    >
      <div className="flex flex-col gap-2">
        {allDay.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-dim">
              All day
            </span>
            {allDay.map((e, i) => (
              <span key={e.id} className="text-sm text-fg">
                {e.title}
                {i < allDay.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
        )}

        {timed.length > 0 && (
          <ul className="-mx-4 flex flex-col">
            {timed.map((e, i) => {
              const isPast = now
                ? new Date(e.ends_at).getTime() < now.getTime()
                : false;
              const isCurrent = i === currentIdx;
              const isLive = i === liveIdx;
              const rel =
                now && !isPast ? relative(minsUntil(e.starts_at, now)) : "";

              return (
                <li
                  key={e.id}
                  className={[
                    "flex items-center gap-3 px-4 py-2.5",
                    isLive
                      ? "border-l-2 border-accent bg-accent/5"
                      : "border-l-2 border-transparent",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "w-11 shrink-0 font-mono text-[11px] tabular",
                      isLive ? "text-accent" : "text-fg-dim",
                    ].join(" ")}
                  >
                    {fmtDate(e.starts_at, "HH:mm")}
                  </span>
                  <span
                    className={[
                      "size-1.5 shrink-0 rounded-full",
                      isCurrent
                        ? "pulse-dot bg-accent shadow-[0_0_8px_var(--color-accent)]"
                        : isLive
                          ? "bg-accent"
                          : isPast
                            ? "bg-fg-dim/50"
                            : "border border-fg-dim bg-transparent",
                    ].join(" ")}
                    aria-hidden
                  />
                  <Link
                    href="/calendar"
                    className={[
                      "min-w-0 flex-1 truncate text-sm transition-colors hover:text-fg",
                      isLive
                        ? "text-fg"
                        : isPast
                          ? "text-fg-dim line-through"
                          : "text-fg-muted",
                    ].join(" ")}
                    title={e.title}
                  >
                    {e.title}
                  </Link>
                  {isCurrent ? (
                    <span className="shrink-0 font-hud text-[10px] uppercase tracking-wider text-accent">
                      Now
                    </span>
                  ) : isPast ? (
                    <span className="shrink-0 font-hud text-[10px] uppercase tracking-wider text-fg-dim">
                      Done
                    </span>
                  ) : rel ? (
                    <span
                      className={[
                        "shrink-0 font-mono text-[11px] tabular",
                        isLive ? "text-accent" : "text-fg-dim",
                      ].join(" ")}
                    >
                      {rel}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
