"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Event } from "@/lib/db/types";
import { fmtDate } from "@/lib/date";
import { Panel } from "./Panel";

function hhmm(iso: string) {
  return fmtDate(iso, "HH:mm");
}

function minsUntil(iso: string, now: Date) {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
}

function relative(mins: number): string {
  if (mins < 0) return "";
  if (mins === 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h${m}m`;
}

export function TerminalAgenda({ events }: { events: Event[] }) {
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

  const nextIdx = useMemo(() => {
    if (!now) return -1;
    return timed.findIndex((e) => new Date(e.starts_at).getTime() > now.getTime());
  }, [timed, now]);

  return (
    <Panel
      title="Today"
      count={timed.length + allDay.length}
      action={{ href: "/calendar", label: "Calendar" }}
      emptyState={
        timed.length === 0 && allDay.length === 0
          ? { show: true, label: "Nothing scheduled today" }
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {allDay.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
          <ul className="flex flex-col">
            {timed.map((e, i) => {
              const start = new Date(e.starts_at);
              const end = new Date(e.ends_at);
              const isPast = now ? end.getTime() < now.getTime() : false;
              const isCurrent = now
                ? start.getTime() <= now.getTime() &&
                  end.getTime() >= now.getTime()
                : false;
              const isNext = i === nextIdx;
              const rel = now ? relative(minsUntil(e.starts_at, now)) : "";
              const done = e.linked_task?.status === "done";

              const dotColor = isCurrent
                ? "bg-accent"
                : isNext
                  ? "bg-warn"
                  : "bg-fg-dim";

              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 border-b border-edge/60 py-2 last:border-0"
                >
                  <span
                    className={[
                      "size-2 shrink-0 rounded-full",
                      dotColor,
                      isPast ? "opacity-40" : "",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span className="w-[92px] shrink-0 text-xs tabular text-fg-dim">
                    {hhmm(e.starts_at)}–{hhmm(e.ends_at)}
                  </span>
                  <Link
                    href="/calendar"
                    className={[
                      "flex-1 truncate text-sm transition-colors hover:text-fg",
                      isCurrent
                        ? "text-fg"
                        : isPast
                          ? "text-fg-dim line-through"
                          : "text-fg-muted",
                      done && !isPast ? "line-through" : "",
                    ].join(" ")}
                    title={e.title}
                  >
                    {e.title}
                  </Link>
                  {isCurrent ? (
                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                      Now
                    </span>
                  ) : isPast ? (
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-fg-dim">
                      Done
                    </span>
                  ) : rel ? (
                    <span
                      className={[
                        "shrink-0 text-[11px] tabular",
                        isNext ? "text-warn" : "text-fg-dim",
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
