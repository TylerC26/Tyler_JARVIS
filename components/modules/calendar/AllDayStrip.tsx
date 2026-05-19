"use client";

import { getCategory } from "@/lib/calendar/categories";
import { layoutAllDayBand } from "@/lib/calendar/allday";
import type { Event } from "@/lib/db/types";

const ROW_HEIGHT_PX = 22;
const ROW_GAP_PX = 2;
const STRIP_PAD_Y = 4;

type Props = {
  days: Date[];
  events: Event[];
  onSelectEvent: (event: Event) => void;
  // 60px gutter on the left, then 7 day cols. CSS grid same as WeekView.
  gutterWidthPx?: number;
};

export function AllDayStrip({
  days,
  events,
  onSelectEvent,
  gutterWidthPx = 60,
}: Props) {
  const { segments, rowCount } = layoutAllDayBand(events, days);

  if (segments.length === 0) return null;

  const stripHeight = rowCount * ROW_HEIGHT_PX + (rowCount - 1) * ROW_GAP_PX + STRIP_PAD_Y * 2;

  return (
    <div className="border-b border-edge bg-surface-2/30">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${gutterWidthPx}px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="border-r border-edge px-1 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim text-right pr-1.5">
          all day
        </div>
        <div
          className="relative col-span-full"
          style={{
            gridColumn: `2 / span ${days.length}`,
            height: `${stripHeight}px`,
            paddingTop: `${STRIP_PAD_Y}px`,
            paddingBottom: `${STRIP_PAD_Y}px`,
          }}
        >
          {/* Day column dividers (subtle background) */}
          {days.map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-edge/40 first:border-l-0"
              style={{
                left: `${(i / days.length) * 100}%`,
                width: `${(1 / days.length) * 100}%`,
              }}
            />
          ))}
          {segments.map((seg) => {
            const cat = getCategory(seg.category);
            const widthPct = ((seg.endCol - seg.startCol + 1) / days.length) * 100;
            const leftPct = (seg.startCol / days.length) * 100;
            const linkedDone = seg.linked_task?.status === "done";
            return (
              <button
                type="button"
                key={`${seg.id}-${seg.startCol}`}
                onClick={() => onSelectEvent(seg)}
                title={seg.title}
                className={[
                  "absolute flex items-center gap-1.5 rounded-sm border px-1.5 overflow-hidden text-left",
                  "hover:brightness-110 hover:shadow",
                  linkedDone ? "opacity-50 saturate-50" : "",
                  cat.bg,
                  cat.border,
                ].join(" ")}
                style={{
                  top: `${STRIP_PAD_Y + seg.row * (ROW_HEIGHT_PX + ROW_GAP_PX)}px`,
                  height: `${ROW_HEIGHT_PX}px`,
                  left: `calc(${leftPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                }}
              >
                <span
                  className={`shrink-0 text-[10px] leading-none ${cat.text}`}
                  aria-hidden
                >
                  {cat.glyph}
                </span>
                <span
                  className={[
                    "font-mono text-[11px] truncate text-fg flex-1",
                    linkedDone ? "line-through" : "",
                  ].join(" ")}
                >
                  {seg.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
