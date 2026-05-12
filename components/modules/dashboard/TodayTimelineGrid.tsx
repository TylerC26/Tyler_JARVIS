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

function hourFraction(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return Math.min(Math.max((h - START_HOUR) / TOTAL_HOURS, 0), 1);
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

      <div className="relative h-16 rounded-sm border border-edge bg-surface-2/40">
        <div className="absolute inset-0 grid grid-cols-1">
          {ticks.map((h) => (
            <span
              key={h}
              className="absolute top-0 bottom-0 border-l border-edge/60"
              style={{ left: `${((h - START_HOUR) / TOTAL_HOURS) * 100}%` }}
            />
          ))}
        </div>

        {timed.map((e) => {
          const start = new Date(e.starts_at);
          const end = new Date(e.ends_at);
          const left = hourFraction(start) * 100;
          const right = hourFraction(end) * 100;
          const width = Math.max(right - left, 1.5);
          const cat = getCategory(e.category);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              title={`${e.title} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`}
              className={[
                "absolute top-2 bottom-2 flex items-center justify-center overflow-hidden rounded-sm border font-mono text-[11px] leading-none cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-accent",
                cat.bg,
                cat.border,
                cat.text,
              ].join(" ")}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span aria-hidden>{cat.glyph}</span>
            </button>
          );
        })}

        <TimelineNowMarker startHour={START_HOUR} endHour={END_HOUR} />
      </div>

      <div className="flex justify-between font-mono text-[9px] tabular-nums text-fg-dim">
        {ticks
          .filter((h) => h % 3 === 0)
          .map((h) => (
            <span key={h}>{String(h).padStart(2, "0")}:00</span>
          ))}
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
