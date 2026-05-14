import {
  differenceInCalendarDays,
  format,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";

export function todayISO(): string {
  // YYYY-MM-DD in local time, suitable for `date` columns
  const d = new Date();
  return format(d, "yyyy-MM-dd");
}

export function fmtDate(input: string | Date, pattern = "yyyy.MM.dd"): string {
  const d = typeof input === "string" ? parseISO(input) : input;
  return format(d, pattern);
}

export function fmtDateTime(input: string | Date): string {
  const d = typeof input === "string" ? parseISO(input) : input;
  return format(d, "yyyy.MM.dd HH:mm");
}

export function fmtRelativeDay(input: string | Date): string {
  const d = typeof input === "string" ? parseISO(input) : input;
  const now = startOfDay(new Date());
  const target = startOfDay(d);
  const diff = differenceInCalendarDays(target, now);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  if (diff === -1) return "YESTERDAY";
  if (diff > 1 && diff <= 7) return `+${diff}D`;
  if (diff < -1 && diff >= -7) return `${diff}D`;
  return format(d, "MMM d");
}

export function isDateToday(input: string | Date): boolean {
  const d = typeof input === "string" ? parseISO(input) : input;
  return isToday(d);
}
