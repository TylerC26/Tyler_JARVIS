"use client";

import { format, isSameMonth, isToday } from "date-fns";
import { getCategory } from "@/lib/calendar/categories";
import { fmtTimeShort, isSameLocalDay, monthCells } from "@/lib/calendar/grid";
import type { Event } from "@/lib/db/types";

type Props = {
  cursor: Date;
  events: Event[];
  onSelectEvent: (event: Event) => void;
  onCreateAt: (starts_at: Date) => void;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function MonthView({ cursor, events, onSelectEvent, onCreateAt }: Props) {
  const cells = monthCells(cursor);

  function eventsOnDay(day: Date): Event[] {
    return events
      .filter((e) => isSameLocalDay(e.starts_at, day))
      .sort((a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
  }

  return (
    <div className="rounded-md border border-edge bg-surface/40 overflow-hidden">
      <div className="grid grid-cols-7 bg-surface-2/40 border-b border-edge">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-muted"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridAutoRows: "minmax(110px, 1fr)" }}>
        {cells.map((day, i) => {
          const inMonth = isSameMonth(day, cursor);
          const dayEvents = eventsOnDay(day);
          return (
            <button
              type="button"
              key={i}
              onClick={() => {
                const at = new Date(day);
                at.setHours(9, 0, 0, 0);
                onCreateAt(at);
              }}
              className={[
                "relative flex flex-col items-stretch border-r border-b border-edge/60 px-1.5 py-1 text-left",
                "hover:bg-accent/[0.04] transition-colors",
                inMonth ? "bg-transparent" : "bg-surface-2/30 text-fg-dim",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "font-mono text-[11px] tabular",
                    isToday(day)
                      ? "rounded-sm bg-accent/20 text-accent px-1"
                      : inMonth
                        ? "text-fg"
                        : "text-fg-dim",
                  ].join(" ")}
                >
                  {format(day, "d")}
                </span>
                {dayEvents.length > 3 && (
                  <span className="font-mono text-[9px] tabular text-fg-dim">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const cat = getCategory(e.category);
                  return (
                    <span
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEvent(e);
                      }}
                      className={[
                        "rounded-sm border px-1 py-0.5 font-mono text-[10px] truncate cursor-pointer hover:brightness-125",
                        cat.bg,
                        cat.border,
                      ].join(" ")}
                    >
                      <span className={`mr-1 ${cat.text}`} aria-hidden>
                        {cat.glyph}
                      </span>
                      <span className="text-fg">{fmtTimeShort(e.starts_at)}</span>{" "}
                      <span className="text-fg-muted">{e.title}</span>
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
