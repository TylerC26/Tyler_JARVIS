"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Event } from "@/lib/db/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    <section className="font-mono text-[13px] leading-relaxed">
      <div className="flex items-center gap-2">
        <span className="phosphor text-accent">agenda&gt;</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">
          {timed.length} timed{allDay.length > 0 ? ` · ${allDay.length} all-day` : ""}
        </span>
      </div>

      {allDay.length > 0 && (
        <div className="pl-6 text-fg-muted">
          <span className="text-fg-dim">all-day&gt;</span>{" "}
          {allDay.map((e, i) => (
            <span key={e.id}>
              {i > 0 && <span className="text-fg-dim"> · </span>}
              <span className="text-fg">{e.title}</span>
            </span>
          ))}
        </div>
      )}

      {timed.length === 0 ? (
        <div className="pl-6 text-fg-dim">// nothing scheduled today.</div>
      ) : (
        <ul className="pl-6">
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

            return (
              <li
                key={e.id}
                className={[
                  "flex items-baseline gap-2",
                  isPast ? "text-fg-dim line-through" : "text-fg-muted",
                ].join(" ")}
              >
                <span
                  className={[
                    "w-3 shrink-0",
                    isCurrent ? "text-accent phosphor" : "",
                    isNext ? "text-warn" : "",
                  ].join(" ")}
                  aria-hidden
                >
                  {isCurrent ? "▶" : isNext ? "▸" : "·"}
                </span>
                <span className="tabular text-fg-dim w-24 shrink-0">
                  {hhmm(e.starts_at)}–{hhmm(e.ends_at)}
                </span>
                <Link
                  href="/calendar"
                  className={[
                    "flex-1 truncate hover:text-accent",
                    isCurrent ? "text-accent" : isNext ? "text-fg" : "",
                    done ? "line-through" : "",
                  ].join(" ")}
                  title={e.title}
                >
                  {e.title}
                </Link>
                {rel && !isPast && (
                  <span
                    className={[
                      "shrink-0 text-[10px] uppercase tracking-wider",
                      isNext ? "text-warn" : "text-fg-dim",
                    ].join(" ")}
                  >
                    {rel}
                  </span>
                )}
                {isCurrent && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-accent phosphor">
                    now
                  </span>
                )}
                {isPast && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-dim">
                    done
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
