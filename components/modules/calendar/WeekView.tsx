"use client";

import { format, isSameDay, isToday } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  HOUR_END,
  HOUR_START,
  HOURS_VISIBLE,
  PX_PER_HOUR,
  PX_PER_MINUTE,
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

  // "Now" indicator: ticks every minute on the client. Initial state is null
  // so the server-rendered HTML matches the client's first paint — we only
  // start drawing the line after mount.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const todayIdx = days.findIndex((d) => isToday(d));
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const nowVisible =
    now !== null &&
    todayIdx >= 0 &&
    nowMinutes >= HOUR_START * 60 &&
    nowMinutes < HOUR_END * 60;
  const nowTop = (nowMinutes - HOUR_START * 60) * PX_PER_MINUTE;

  // Partition: all-day OR multi-day events go to the top strip; everything
  // else lives in the timed grid.
  const allDayEvents = events.filter(
    (e) => e.all_day || spansMultipleDays(e),
  );
  const timedEvents = events.filter(
    (e) => !e.all_day && !spansMultipleDays(e),
  );

  function handleSlotClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    // Measure relative to the day column, not e.currentTarget: the click
    // usually lands on an hour-gridline child whose rect spans only that one
    // hour, so its top would make timeForY think every click is in the first
    // visible hour. closest("[data-day]") resolves to the column either way.
    const col = e.currentTarget.closest<HTMLElement>("[data-day]");
    if (!col) return;
    const colRect = col.getBoundingClientRect();
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
      // overscroll-contain stops iOS rubber-banding from bubbling to the page
      // when the user reaches the top/bottom of the week's timeline.
      style={{ maxHeight: "70dvh", overscrollBehavior: "contain" }}
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
        {/* "Now" indicator: thin accent line across the day columns at the
            current time, a dot on the today column, and a tiny time label in
            the hour gutter. Only renders when today is in the visible week
            AND the current time falls within the 6am–10pm window. */}
        {nowVisible && (
          <>
            <div
              className="pointer-events-none absolute z-10 h-px bg-accent"
              style={{ top: `${nowTop}px`, left: "60px", right: 0 }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{
                top: `${nowTop}px`,
                left: `calc(60px + (100% - 60px) * ${(todayIdx + 0.5) / 7})`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute z-10 -translate-y-1/2 rounded-sm bg-base px-1 font-mono text-[9px] uppercase leading-none text-accent"
              style={{ top: `${nowTop}px`, left: "2px" }}
              aria-hidden
            >
              {format(now, "h:mm")}
            </div>
          </>
        )}
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

