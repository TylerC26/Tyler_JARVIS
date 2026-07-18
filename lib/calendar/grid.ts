import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { getOwnerTz } from "@/lib/auth/currentUser";

// CONTRACT — every Date crossing this module's boundary is a TRUE INSTANT, and
// every wall-clock meaning ("9am", "which day", "start of the week") resolves
// against the OWNER's zone (getOwnerTz), never the runtime's.
//
// This module used to read and write wall clock with bare local getters
// (getHours/setHours/startOfDay/format), which meant "9am" meant 9am *in the
// browser* — while the server, the DB writer, and every prompt meant 9am in the
// owner's zone. Identical only while the browser sat in Asia/Hong_Kong.
//
// Why instants and not the toZonedTime "shifted Date" trick used inside
// lib/date.ts: a shifted Date is only readable by the runtime that made it. The
// cursor is built on the server, serialized with .toISOString(), and re-read in
// the browser (app/(app)/calendar/page.tsx → CalendarView), so a shifted Date
// would be reinterpreted with the browser's getters and silently mean a
// different moment. Instants survive that round-trip; wall clock is derived
// on demand via the two helpers below.
//
// The shift/unshift pair stays *strictly internal* to a single function: enter
// wall-clock space with zoned(), do date-fns math, leave with unzoned().
//
// Two known edges, both requiring a DST zone and both left as-is:
//
//  - date-fns-tz builds its result with the RUNTIME's setters, so if an owner
//    wall clock lands inside the *runtime's* spring-forward gap it is shifted by
//    an hour. Needs a browser in a DST zone (Vercel is UTC, so the server is
//    immune) and bites for one wall-clock hour a year. Using Intl directly
//    everywhere would close it; not worth the churn.
//  - fromZonedTime resolves a nonexistent wall clock (inside a gap) BACKWARD.
//    nextOwnerHour guards against that explicitly because its contract is
//    strictly "after `from`"; snapTo15Minutes and atOwnerHour can also land
//    there in principle, but every caller passes an hour inside HOUR_START..
//    HOUR_END, and no real zone puts a DST gap in the middle of the day.

// An instant -> a Date whose LOCAL getters read the owner's wall clock. Only
// safe to use within one function body — never return one of these.
function zoned(instant: Date): Date {
  return toZonedTime(instant, getOwnerTz());
}

// The inverse: a wall-clock Date (as produced by zoned()) -> the true instant.
function unzoned(wallClock: Date): Date {
  return fromZonedTime(wallClock, getOwnerTz());
}

export const HOUR_START = 6; // earliest hour shown in week view
export const HOUR_END = 22; // latest hour shown
export const HOURS_VISIBLE = HOUR_END - HOUR_START; // 16
export const PX_PER_HOUR = 56;
export const SNAP_MINUTES = 15;
export const PX_PER_MINUTE = PX_PER_HOUR / 60;

// The instant of owner-local midnight for the owner-day containing `instant`.
export function startOfOwnerDayInstant(instant: Date): Date {
  return unzoned(startOfDay(zoned(instant)));
}

// The owner-local calendar day ("YYYY-MM-DD") containing `instant`.
function ownerDayKey(instant: Date): string {
  return formatInTimeZone(instant, getOwnerTz(), "yyyy-MM-dd");
}

export function weekDays(cursor: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const start = startOfWeek(zoned(cursor), { weekStartsOn });
  // Re-derive each day from the wall-clock start rather than adding 24h to the
  // instant: across a DST boundary a local day is 23 or 25 hours long.
  return Array.from({ length: 7 }, (_, i) => unzoned(addDays(start, i)));
}

export function weekRange(
  cursor: Date,
  weekStartsOn: 0 | 1 = 0,
): { start: Date; end: Date } {
  const z = zoned(cursor);
  return {
    start: unzoned(startOfWeek(z, { weekStartsOn })),
    end: unzoned(endOfWeek(z, { weekStartsOn })),
  };
}

export function monthCells(cursor: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const z = zoned(cursor);
  const gridStart = startOfWeek(startOfMonth(z), { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(z), { weekStartsOn });
  const cells: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    cells.push(unzoned(d));
  }
  return cells;
}

export function monthRange(
  cursor: Date,
  weekStartsOn: 0 | 1 = 0,
): { start: Date; end: Date } {
  const z = zoned(cursor);
  return {
    start: unzoned(startOfWeek(startOfMonth(z), { weekStartsOn })),
    end: unzoned(endOfWeek(endOfMonth(z), { weekStartsOn })),
  };
}

export function hourSlots(): number[] {
  return Array.from({ length: HOURS_VISIBLE }, (_, i) => HOUR_START + i);
}

// Minutes since owner-local midnight for an instant.
export function minutesFromMidnight(d: Date): number {
  const z = zoned(d);
  return z.getHours() * 60 + z.getMinutes();
}

export function eventTopPx(starts_at: string): number {
  const offsetMinutes =
    minutesFromMidnight(new Date(starts_at)) - HOUR_START * 60;
  return Math.max(0, offsetMinutes * PX_PER_MINUTE);
}

export function eventHeightPx(starts_at: string, ends_at: string): number {
  // A duration is zone-free — plain instant arithmetic is correct here.
  const minutes = Math.max(
    15,
    (new Date(ends_at).getTime() - new Date(starts_at).getTime()) / 60000,
  );
  return minutes * PX_PER_MINUTE;
}

export function snapTo15Minutes(date: Date): Date {
  // Snap against the owner's wall clock, not the epoch: epoch-rounding only
  // lands on local quarter-hours for whole-hour offsets, so a +05:30 or +05:45
  // owner zone would snap to :15/:45.
  const z = zoned(date);
  z.setSeconds(0, 0);
  const snapped = Math.round(z.getMinutes() / SNAP_MINUTES) * SNAP_MINUTES;
  z.setMinutes(snapped);
  return unzoned(z);
}

export function timeForY(yPx: number, day: Date): Date {
  const minutes = HOUR_START * 60 + yPx / PX_PER_MINUTE;
  const z = zoned(day);
  z.setHours(0, 0, 0, 0);
  z.setMinutes(minutes);
  return snapTo15Minutes(unzoned(z));
}

// The instant of `hour:minute` owner-local, on the owner-day containing `day`.
export function atOwnerHour(day: Date, hour: number, minute = 0): Date {
  const z = zoned(day);
  z.setHours(hour, minute, 0, 0);
  return unzoned(z);
}

// The instant of the next whole owner-local hour after `from`.
export function nextOwnerHour(from: Date = new Date()): Date {
  const z = zoned(from);
  z.setMinutes(0, 0, 0);
  z.setHours(z.getHours() + 1);
  let next = unzoned(z);
  // A wall clock inside a DST spring-forward gap doesn't exist, and
  // fromZonedTime resolves it BACKWARD — so the "next" hour could land before
  // `from` (e.g. America/New_York 01:30 -> 01:00). Walk forward until the
  // result is genuinely in the future; the gap is at most a couple of hours.
  for (let i = 0; i < 4 && next.getTime() <= from.getTime(); i++) {
    z.setHours(z.getHours() + 1);
    next = unzoned(z);
  }
  return next;
}

export function fmtTime(d: Date | string): string {
  return formatInTimeZone(new Date(d), getOwnerTz(), "h:mm a");
}

export function fmtTimeShort(d: Date | string): string {
  const tz = getOwnerTz();
  const at = new Date(d);
  const pattern = formatInTimeZone(at, tz, "mm") === "00" ? "ha" : "h:mma";
  return formatInTimeZone(at, tz, pattern).toLowerCase();
}

export function fmtRangeHeader(view: "week" | "month", cursor: Date): string {
  const tz = getOwnerTz();
  if (view === "week") {
    const { start, end } = weekRange(cursor);
    const sameMonth =
      formatInTimeZone(start, tz, "yyyy-MM") ===
      formatInTimeZone(end, tz, "yyyy-MM");
    return sameMonth
      ? `${formatInTimeZone(start, tz, "MMM d")} – ${formatInTimeZone(end, tz, "d, yyyy")}`
      : `${formatInTimeZone(start, tz, "MMM d")} – ${formatInTimeZone(end, tz, "MMM d, yyyy")}`;
  }
  return formatInTimeZone(cursor, tz, "MMMM yyyy");
}

export function navigate(
  view: "week" | "month",
  cursor: Date,
  delta: -1 | 0 | 1,
): Date {
  // "Today" is the owner's today. This used to be startOfDay(new Date()) —
  // browser-local midnight — which could land a day off from the cursor the
  // page was server-rendered with.
  if (delta === 0) return startOfOwnerDayInstant(new Date());
  const z = zoned(cursor);
  if (view === "week") {
    return unzoned(delta === 1 ? addWeeks(z, 1) : subWeeks(z, 1));
  }
  return unzoned(addMonths(z, delta));
}

export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  return ownerDayKey(new Date(a)) === ownerDayKey(new Date(b));
}

export function eventCoversDay(
  event: { starts_at: string; ends_at: string },
  day: Date,
): boolean {
  const dayStart = startOfOwnerDayInstant(day);
  // Next owner midnight — re-derived through wall clock so a DST day (23h/25h)
  // still ends exactly on midnight rather than dayStart+24h.
  const dayEnd = unzoned(addDays(startOfDay(zoned(dayStart)), 1));
  const startMs = new Date(event.starts_at).getTime();
  const endMs = new Date(event.ends_at).getTime();
  // Half-open: [start, end). Event covers the day if it overlaps that interval.
  return startMs < dayEnd.getTime() && endMs > dayStart.getTime();
}

export function spansMultipleDays(event: {
  starts_at: string;
  ends_at: string;
}): boolean {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (isSameLocalDay(start, end)) return false;
  // An end sitting exactly on the next owner midnight is an exclusive bound —
  // that's still a single day.
  const nextMidnight = unzoned(addDays(startOfDay(zoned(start)), 1));
  return end.getTime() > nextMidnight.getTime();
}

/** datetime-local input expects YYYY-MM-DDTHH:mm — in the OWNER's wall clock. */
export function toLocalInput(iso: string | Date): string {
  return formatInTimeZone(new Date(iso), getOwnerTz(), "yyyy-MM-dd'T'HH:mm");
}

/** Parse a datetime-local value AS owner wall clock (not the browser's). */
export function fromLocalInput(value: string): Date {
  return fromZonedTime(value, getOwnerTz());
}
