"use client";

import { format, isSameDay, isToday } from "date-fns";
import { useRef } from "react";
import {
  HOUR_START,
  HOURS_VISIBLE,
  PX_PER_HOUR,
  combineDateAndTime,
  hourSlots,
  spansMultipleDays,
  timeForY,
  weekDays,
} from "@/lib/calendar/grid";
import { layoutDayEvents, type LaidOutEvent } from "@/lib/calendar/layout";
import type { Event } from "@/lib/db/types";
import { AllDayStrip } from "./AllDayStrip";
import type { WifeShiftMap } from "./CalendarView";
import { EventBlock } from "./EventBlock";
import { useDragReschedule } from "./hooks/useDragReschedule";
import { WifeShiftBadge } from "./WifeShiftBadge";

type Props = {
  cursor: Date;
  events: Event[];
  wifeShifts: WifeShiftMap;
  onSelectEvent: (event: Event) => void;
  onCreateAt: (starts_at: Date) => void;
  onMove: (id: string, starts: string, ends: string) => Promise<void>;
};

export function WeekView({
  cursor,
  events,
  wifeShifts,
  onSelectEvent,
  onCreateAt,
  onMove,
}: Props) {
  const days = weekDays(cursor);
  const drag = useDragReschedule(days, onMove);
  const containerRef = useRef<HTMLDivElement>(null);

  // Partition: all-day OR multi-day events go to the top strip; everything
  // else lives in the timed grid.
  const allDayEvents = events.filter(
    (e) => e.all_day || spansMultipleDays(e),
  );
  const timedEvents = events.filter(
    (e) => !e.all_day && !spansMultipleDays(e),
  );

  function handleSlotClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const colRect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - colRect.top;
    const time = timeForY(y, day);
    onCreateAt(time);
  }

  function eventsOnDay(day: Date): LaidOutEvent[] {
    const dayEvents = timedEvents.filter((e) =>
      isSameDay(new Date(e.starts_at), day),
    );
    return layoutDayEvents(dayEvents);
  }

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-edge bg-surface/40 overflow-y-auto"
      style={{ maxHeight: "70vh" }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    >
      {/* Header + all-day strip stick together to the top of the scroller so
          the day labels stay visible while the timeline scrolls. Keeping both
          inside the same scroll container (instead of a separate sibling that
          doesn't scroll) means the vertical scrollbar takes width from the
          whole calendar uniformly — the header's grid columns can't drift
          from the body's. */}
      <div className="sticky top-0 z-20 bg-surface">
        {/* Header row */}
        <div
          className="grid bg-surface-2/40 border-b border-edge"
          style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}
        >
          <div />
          {days.map((day, i) => {
            const shift = wifeShifts[format(day, "yyyy-MM-dd")];
            return (
              <div
                key={i}
                className={[
                  "px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wider border-l border-edge min-w-0",
                  isToday(day) ? "text-accent bg-accent/5" : "text-fg-muted",
                ].join(" ")}
              >
                <div>{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div className={isToday(day) ? "text-accent text-base" : "text-fg text-base"}>
                  {day.getDate()}
                </div>
                {/* Always reserve the badge slot so date numbers line up
                    across the week even when only some days carry a shift. */}
                <div className="mt-1 flex h-[16px] justify-center items-center">
                  {shift ? (
                    <WifeShiftBadge code={shift} />
                  ) : (
                    <span className="invisible">·</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day / multi-day strip */}
        <AllDayStrip
          days={days}
          events={allDayEvents}
          onSelectEvent={onSelectEvent}
        />
      </div>

      {/* Body grid */}
      <div className="relative">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))",
            height: `${HOURS_VISIBLE * PX_PER_HOUR}px`,
          }}
        >
          {/* Hour gutter */}
          <div className="relative border-r border-edge">
            {hourSlots().map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-edge/60 px-1 font-mono text-[9px] uppercase text-fg-dim text-right pr-1"
                style={{ top: `${i * PX_PER_HOUR}px`, height: `${PX_PER_HOUR}px` }}
              >
                {h % 12 === 0 ? 12 : h % 12}
                {h < 12 ? "a" : "p"}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, i) => (
            <div
              key={i}
              ref={(el) => drag.registerDayRef(i, el)}
              data-day={i}
              className={[
                "relative border-l border-edge",
                isToday(day) ? "bg-accent/[0.02]" : "",
              ].join(" ")}
              onClick={(e) => {
                // Only fire on background click — not on event blocks
                if (e.target === e.currentTarget) handleSlotClick(day, e);
              }}
            >
              {/* Hour gridlines */}
              {hourSlots().map((h, hi) => (
                <div
                  key={h}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) handleSlotClick(day, e);
                  }}
                  className="absolute left-0 right-0 border-t border-edge/40 hover:bg-accent/5 cursor-pointer"
                  style={{
                    top: `${hi * PX_PER_HOUR}px`,
                    height: `${PX_PER_HOUR}px`,
                  }}
                />
              ))}

              {/* Events */}
              {eventsOnDay(day).map((event) => {
                const draftForThis =
                  drag.draggingId === event.id ? drag.draft : null;
                return (
                  <EventBlock
                    key={event.id}
                    event={event}
                    lane={event.lane}
                    trackCount={event.trackCount}
                    draftStartsAt={draftForThis?.starts_at}
                    draftEndsAt={draftForThis?.ends_at}
                    isDragging={drag.draggingId === event.id}
                    onClick={() => onSelectEvent(event)}
                    onDragStart={(e) => drag.start("move", event, e)}
                    onResizeStart={(e) => drag.start("resize", event, e)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {void HOUR_START}
      {void combineDateAndTime}
    </div>
  );
}

