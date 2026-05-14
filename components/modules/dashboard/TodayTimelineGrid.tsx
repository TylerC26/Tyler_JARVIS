"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { TimelineNowMarker } from "@/components/modules/dashboard/TimelineNowMarker";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { getCategory } from "@/lib/calendar/categories";
import type { Event } from "@/lib/db/types";

const START_HOUR = 6;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_WIDTH_PX = 110;
const TIMELINE_WIDTH_PX = TOTAL_HOURS * HOUR_WIDTH_PX;

function hourOffsetPx(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const clamped = Math.min(Math.max(h, START_HOUR), END_HOUR);
  return (clamped - START_HOUR) * HOUR_WIDTH_PX;
}

export function TodayTimelineGrid({ events }: { events: Event[] }) {
  const [selected, setSelected] = useState<Event | null>(null);
  const selCat = selected ? getCategory(selected.category) : null;
  const selStart = selected ? new Date(selected.starts_at) : null;
  const selEnd = selected ? new Date(selected.ends_at) : null;
  const ticks = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);
  const timed = events.filter((e) => !e.all_day);
  const allDay = events.filter((e) => e.all_day);

  return (
    <div className="flex flex-col gap-2">
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allDay.map((e) => {
            const cat = getCategory(e.category);
            return (
              <span
                key={e.id}
                className={[
                  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  cat.bg,
                  cat.border,
                  cat.text,
                ].join(" ")}
                title={e.title}
              >
                <span aria-hidden>{cat.glyph}</span>
                <span className="truncate max-w-[12rem]">{e.title}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border border-edge bg-surface-2">
        <div
          className="relative"
          style={{ width: `${TIMELINE_WIDTH_PX}px` }}
        >
          <div className="relative h-28">
            {ticks.map((h) => {
              const isHour3 = (h - START_HOUR) % 3 === 0;
              return (
                <span
                  key={h}
                  className={[
                    "pointer-events-none absolute top-0 bottom-0 border-l",
                    isHour3 ? "border-edge-strong" : "border-edge",
                  ].join(" ")}
                  style={{ left: `${(h - START_HOUR) * HOUR_WIDTH_PX}px` }}
                />
              );
            })}

            <span
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-edge"
              aria-hidden
            />

            {timed.length === 0 && (
              <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-[0.25em] text-fg-dim">
                {allDay.length > 0
                  ? "// all-day only — no timed events"
                  : "// no events"}
              </span>
            )}

            {timed.map((e) => {
              const start = new Date(e.starts_at);
              const end = new Date(e.ends_at);
              const left = hourOffsetPx(start);
              const right = hourOffsetPx(end);
              const width = Math.max(right - left, 28);
              const cat = getCategory(e.category);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e)}
                  title={`${e.title} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`}
                  className={[
                    "absolute top-2 bottom-2 flex items-center gap-1.5 overflow-hidden rounded-sm border px-2 font-mono text-[11px] leading-none cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-accent",
                    cat.bg,
                    cat.border,
                    cat.text,
                  ].join(" ")}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  <span className="shrink-0" aria-hidden>
                    {cat.glyph}
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                    <span className="truncate w-full font-medium">
                      {e.title}
                    </span>
                    <span className="truncate w-full text-[9px] uppercase tracking-wider opacity-70 tabular-nums">
                      {format(start, "HH:mm")}–{format(end, "HH:mm")}
                    </span>
                  </span>
                </button>
              );
            })}

            <TimelineNowMarker startHour={START_HOUR} endHour={END_HOUR} />
          </div>

          <div className="relative h-5 border-t border-edge bg-surface-2/60">
            {ticks.map((h) => (
              <span
                key={h}
                className="absolute -translate-x-1/2 top-1 font-mono text-[10px] tabular-nums text-fg-muted"
                style={{ left: `${(h - START_HOUR) * HOUR_WIDTH_PX}px` }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>
      </div>

      {selected && selCat && selStart && selEnd && (
        <AddItemModal
          open
          onClose={() => setSelected(null)}
          subtitle="event preview"
          title={selected.title}
          footer={
            <Link
              href="/calendar"
              className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-accent hover:border-edge-strong"
            >
              open in calendar →
            </Link>
          }
        >
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 font-mono text-xs">
            <dt className="text-fg-dim uppercase tracking-wider text-[10px]">
              when
            </dt>
            <dd className="text-fg tabular-nums">
              {selected.all_day
                ? "ALL DAY"
                : `${format(selStart, "HH:mm")} – ${format(selEnd, "HH:mm")}`}
            </dd>

            <dt className="text-fg-dim uppercase tracking-wider text-[10px]">
              category
            </dt>
            <dd className={`flex items-center gap-1.5 ${selCat.text}`}>
              <span aria-hidden>{selCat.glyph}</span>
              <span>{selCat.label}</span>
            </dd>

            {selected.location && (
              <>
                <dt className="text-fg-dim uppercase tracking-wider text-[10px]">
                  where
                </dt>
                <dd className="text-fg-muted">{selected.location}</dd>
              </>
            )}

            {selected.description && (
              <>
                <dt className="text-fg-dim uppercase tracking-wider text-[10px]">
                  notes
                </dt>
                <dd className="text-fg-muted whitespace-pre-wrap line-clamp-4">
                  {selected.description}
                </dd>
              </>
            )}
          </dl>
        </AddItemModal>
      )}
    </div>
  );
}
