import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { getOwnerTz } from "@/lib/auth/currentUser";

// Every date/time helper here resolves against the owner's configured timezone
// (getOwnerTz) — never the runtime's local zone. That keeps "today", relative
// day labels, and formatting identical on the Vercel server (a UTC box), the
// deployed site, and the Telegram webhook.

function toDate(input: string | Date): Date {
  return typeof input === "string" ? parseISO(input) : input;
}

// "Now" as a Date whose standard (local) getters report the owner's wall-clock
// time. Use this when feeding date-fns operations (startOfDay, isBefore, …)
// that you want to behave as if the runtime were in the owner's timezone.
export function ownerNow(): Date {
  return toZonedTime(new Date(), getOwnerTz());
}

// Today's calendar date in the owner's timezone, as YYYY-MM-DD.
export function todayISO(): string {
  return formatInTimeZone(new Date(), getOwnerTz(), "yyyy-MM-dd");
}

// A YYYY-MM-DD `n` days from today in the owner's timezone (n may be negative).
export function daysFromTodayISO(n: number): string {
  return formatInTimeZone(
    new Date(Date.now() + n * 86_400_000),
    getOwnerTz(),
    "yyyy-MM-dd",
  );
}

// The instant of owner-local midnight for the given day (default: today).
// Returned as a Date — call .toISOString() for a DB range bound.
export function startOfOwnerDay(input?: string | Date): Date {
  const tz = getOwnerTz();
  const day = formatInTimeZone(
    input ? toDate(input) : new Date(),
    tz,
    "yyyy-MM-dd",
  );
  return fromZonedTime(`${day}T00:00:00`, tz);
}

// The last instant of the owner-local day for the given day (default: today).
export function endOfOwnerDay(input?: string | Date): Date {
  const tz = getOwnerTz();
  const day = formatInTimeZone(
    input ? toDate(input) : new Date(),
    tz,
    "yyyy-MM-dd",
  );
  return fromZonedTime(`${day}T23:59:59.999`, tz);
}

export function fmtDate(input: string | Date, pattern = "yyyy.MM.dd"): string {
  return formatInTimeZone(toDate(input), getOwnerTz(), pattern);
}

export function fmtDateTime(input: string | Date): string {
  return formatInTimeZone(toDate(input), getOwnerTz(), "yyyy.MM.dd HH:mm");
}

export function fmtRelativeDay(input: string | Date): string {
  const tz = getOwnerTz();
  const now = toZonedTime(new Date(), tz);
  const target = toZonedTime(toDate(input), tz);
  const diff = differenceInCalendarDays(target, now);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  if (diff === -1) return "YESTERDAY";
  if (diff > 1 && diff <= 7) return `+${diff}D`;
  if (diff < -1 && diff >= -7) return `${diff}D`;
  return formatInTimeZone(toDate(input), tz, "MMM d");
}

export function isDateToday(input: string | Date): boolean {
  return fmtDate(input, "yyyy-MM-dd") === todayISO();
}
