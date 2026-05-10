import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

export const HOUR_START = 6; // earliest hour shown in week view
export const HOUR_END = 22; // latest hour shown
export const HOURS_VISIBLE = HOUR_END - HOUR_START; // 16
export const PX_PER_HOUR = 56;
export const SNAP_MINUTES = 15;
export const PX_PER_MINUTE = PX_PER_HOUR / 60;

export function weekDays(cursor: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const start = startOfWeek(cursor, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekRange(cursor: Date, weekStartsOn: 0 | 1 = 0): {
  start: Date;
  end: Date;
} {
  const start = startOfWeek(cursor, { weekStartsOn });
  const end = endOfWeek(cursor, { weekStartsOn });
  return { start, end };
}

export function monthCells(cursor: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn });
  const cells: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    cells.push(d);
    d = addDays(d, 1);
  }
  return cells;
}

export function monthRange(cursor: Date, weekStartsOn: 0 | 1 = 0): {
  start: Date;
  end: Date;
} {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  return {
    start: startOfWeek(monthStart, { weekStartsOn }),
    end: endOfWeek(monthEnd, { weekStartsOn }),
  };
}

export function hourSlots(): number[] {
  return Array.from({ length: HOURS_VISIBLE }, (_, i) => HOUR_START + i);
}

export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function eventTopPx(starts_at: string): number {
  const d = new Date(starts_at);
  const offsetMinutes = minutesFromMidnight(d) - HOUR_START * 60;
  return Math.max(0, offsetMinutes * PX_PER_MINUTE);
}

export function eventHeightPx(starts_at: string, ends_at: string): number {
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  const minutes = Math.max(15, (end.getTime() - start.getTime()) / 60000);
  return minutes * PX_PER_MINUTE;
}

export function snapTo15Minutes(date: Date): Date {
  const ms = SNAP_MINUTES * 60 * 1000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

export function timeForY(yPx: number, day: Date): Date {
  const minutes = HOUR_START * 60 + yPx / PX_PER_MINUTE;
  const out = new Date(day);
  out.setHours(0, 0, 0, 0);
  out.setMinutes(minutes);
  return snapTo15Minutes(out);
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, "h:mm a");
}

export function fmtTimeShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const min = date.getMinutes();
  return min === 0 ? format(date, "ha").toLowerCase() : format(date, "h:mma").toLowerCase();
}

export function fmtRangeHeader(view: "week" | "month", cursor: Date): string {
  if (view === "week") {
    const { start, end } = weekRange(cursor);
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return format(cursor, "MMMM yyyy");
}

export function navigate(
  view: "week" | "month",
  cursor: Date,
  delta: -1 | 0 | 1,
): Date {
  if (delta === 0) return startOfDay(new Date());
  if (view === "week") {
    return delta === 1 ? addWeeks(cursor, 1) : subDays(cursor, 7);
  }
  return addMonths(cursor, delta);
}

export function isSameLocalDay(a: Date | string, b: Date | string): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function combineDateAndTime(day: Date, isoTime: string): Date {
  const time = new Date(isoTime);
  const out = new Date(day);
  out.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return out;
}

/** datetime-local input expects YYYY-MM-DDTHH:mm in local time */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** parse the YYYY-MM-DDTHH:mm value back into a Date in local time */
export function fromLocalInput(value: string): Date {
  return new Date(value);
}
