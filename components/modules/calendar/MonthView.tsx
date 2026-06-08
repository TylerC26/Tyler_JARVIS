"use client";

import { format, isSameMonth, isToday } from "date-fns";
import { layoutAllDayBand } from "@/lib/calendar/allday";
import { getCategory } from "@/lib/calendar/categories";
import {
  fmtTimeShort,
  isSameLocalDay,
  monthCells,
  spansMultipleDays,
} from "@/lib/calendar/grid";
import type { Event } from "@/lib/db/types";
import type { WfhStatusMap, WifeShiftMap } from "./CalendarView";
import { WfhStatusBadge } from "./WfhStatusBadge";
import { WifeShiftBadge } from "./WifeShiftBadge";

type Props = {
  cursor: Date;
  events: Event[];
  wifeShifts: WifeShiftMap;
  wfhStatus: WfhStatusMap;
  onSelectEvent: (event: Event) => void;
  onCreateAt: (starts_at: Date) => void;
};

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SPAN_ROW_PX = 18;
const SPAN_GAP_PX = 2;
const SPAN_BAND_TOP_PX = 22;

export function MonthView({
  cursor,
  events,
  wifeShifts,
  wfhStatus,
  onSelectEvent,
  onCreateAt,
}: Props) {
  const cells = monthCells(cursor);
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const spanEvents = events.filter(
    (e) => e.all_day || spansMultipleDays(e),
  );
  const chipEvents = events.filter(
    (e) => !e.all_day && !spansMultipleDays(e),
  );

  function chipsForDay(day: Date) {
    return chipEvents
      .filter((e) => isSameLocalDay(e.starts_at, day))
      .sort(
        (a, b) =>
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

      <div className="flex flex-col">
        {weeks.map((week, wi) => {
          const { segments, rowCount } = layoutAllDayBand(spanEvents, week);
          const bandHeight =
            rowCount === 0
              ? 0
              : rowCount * SPAN_ROW_PX + (rowCount - 1) * SPAN_GAP_PX;
          const rowMinHeight = Math.max(110, SPAN_BAND_TOP_PX + bandHeight + 60);

          return (
            <div
              key={wi}
              className="relative border-b border-edge/60 last:border-b-0"
              style={{ minHeight: `${rowMinHeight}px` }}
            >
              {/* Day cells (background) */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day, di) => {
                  const inMonth = isSameMonth(day, cursor);
                  return (
                    <button
                      type="button"
                      key={di}
                      onClick={() => {
                        const at = new Date(day);
                        at.setHours(9, 0, 0, 0);
                        onCreateAt(at);
                      }}
                      className={[
                        "relative flex flex-col items-stretch border-r border-edge/60 last:border-r-0 px-1.5 py-1 text-left",
                        "hover:bg-accent/[0.04] transition-colors",
                        inMonth ? "bg-transparent" : "bg-surface-2/30 text-fg-dim",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex min-w-0 items-center gap-1">
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
                          <WfhStatusBadge
                            status={wfhStatus[format(day, "yyyy-MM-dd")]}
                          />
                        </div>
                        <WifeShiftBadge
                          code={wifeShifts[format(day, "yyyy-MM-dd")]}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Multi-day spanning bars */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: `${SPAN_BAND_TOP_PX}px`,
                  left: 0,
                  right: 0,
                  height: `${bandHeight}px`,
                }}
              >
                {segments.map((seg) => {
                  const cat = getCategory(seg.category);
                  const widthPct = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                  const leftPct = (seg.startCol / 7) * 100;
                  const linkedDone = seg.linked_task?.status === "done";
                  return (
                    <button
                      type="button"
                      key={`${seg.id}-w${wi}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(seg);
                      }}
                      title={seg.title}
                      className={[
                        "absolute pointer-events-auto flex items-center gap-1.5 rounded-sm border px-1.5 overflow-hidden text-left",
                        "hover:brightness-110 hover:shadow",
                        linkedDone ? "opacity-50 saturate-50" : "",
                        cat.bg,
                        cat.border,
                      ].join(" ")}
                      style={{
                        top: `${seg.row * (SPAN_ROW_PX + SPAN_GAP_PX)}px`,
                        height: `${SPAN_ROW_PX}px`,
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
                          "font-mono text-[10px] truncate text-fg flex-1",
                          linkedDone ? "line-through" : "",
                        ].join(" ")}
                      >
                        {seg.title}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Single-day chips below the band */}
              <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                {week.map((day, di) => {
                  const dayChips = chipsForDay(day);
                  const more = dayChips.length > 3 ? dayChips.length - 3 : 0;
                  return (
                    <div
                      key={di}
                      className="px-1.5 flex flex-col gap-0.5"
                      style={{
                        paddingTop: `${SPAN_BAND_TOP_PX + bandHeight + 4}px`,
                      }}
                    >
                      {dayChips.slice(0, 3).map((e) => {
                        const cat = getCategory(e.category);
                        const linkedDone = e.linked_task?.status === "done";
                        return (
                          <button
                            type="button"
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSelectEvent(e);
                            }}
                            className={[
                              "pointer-events-auto rounded-sm border px-1 py-0.5 font-mono text-[10px] truncate cursor-pointer hover:brightness-125 text-left",
                              linkedDone ? "opacity-50 saturate-50" : "",
                              cat.bg,
                              cat.border,
                            ].join(" ")}
                          >
                            <span className={`mr-1 ${cat.text}`} aria-hidden>
                              {cat.glyph}
                            </span>
                            <span className="text-fg">
                              {fmtTimeShort(e.starts_at)}
                            </span>{" "}
                            <span
                              className={[
                                "text-fg-muted",
                                linkedDone ? "line-through" : "",
                              ].join(" ")}
                            >
                              {e.title}
                            </span>
                          </button>
                        );
                      })}
                      {more > 0 && (
                        <span className="font-mono text-[9px] tabular text-fg-dim px-1">
                          +{more} more
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
