import { differenceInCalendarDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getOwnerTz } from "@/lib/auth/currentUser";

// Every date/time helper here resolves against the owner's configured timezone
// (getOwnerTz) — never the runtime's local zone. That keeps "today", relative
// day labels, and formatting identical on the Vercel server (a UTC box), the
// deployed site, and the Telegram webhook.

function toDate(input: string | Date): Date {
  return typeof input === "string" ? parseISO(input) : input;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The owner-local calendar day (YYYY-MM-DD) for an instant — or, for a bare
// "YYYY-MM-DD" string, that literal day. The special case matters: parseISO
// reads a bare date as RUNTIME-local midnight, so round-tripping it through
// formatInTimeZone would shift it a day whenever the owner's zone is west of
// the runtime. A date column already names its day; don't re-derive it.
function ownerDayOf(input?: string | Date): string {
  if (typeof input === "string" && DATE_ONLY_RE.test(input)) return input;
  return formatInTimeZone(
    input ? toDate(input) : new Date(),
    getOwnerTz(),
    "yyyy-MM-dd",
  );
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
  return fromZonedTime(`${ownerDayOf(input)}T00:00:00`, getOwnerTz());
}

// The instant of the first owner-local day of the current month — used for
// month-to-date aggregates.
export function startOfOwnerMonth(): Date {
  const tz = getOwnerTz();
  const ym = formatInTimeZone(new Date(), tz, "yyyy-MM");
  return fromZonedTime(`${ym}-01T00:00:00`, tz);
}

// The last instant of the owner-local day for the given day (default: today).
export function endOfOwnerDay(input?: string | Date): Date {
  return fromZonedTime(`${ownerDayOf(input)}T23:59:59.999`, getOwnerTz());
}

export function fmtDate(input: string | Date, pattern = "yyyy.MM.dd"): string {
  return formatInTimeZone(toDate(input), getOwnerTz(), pattern);
}

// Format a PURE CALENDAR DATE ("YYYY-MM-DD" — a `date` column such as
// wife_shifts.shift_date, wfh_status.status_date, or a milestone target_date).
//
// A date column carries no instant and no zone: the string IS the label, so it
// must not be zone-converted at all. Anchoring at UTC noon and formatting in
// UTC makes the label identical in every runtime, and noon ±14h can't cross a
// day boundary, so it's DST-proof.
//
// Do NOT route date columns through fmtDate: parseISO reads a bare "2026-07-17"
// as runtime-LOCAL midnight, which formatInTimeZone then shifts for the owner's
// zone — off by a day for any owner tz west of the runtime (e.g. a UTC Vercel
// box rendering America/Toronto turns Jul 17 into Jul 16).
export function fmtDayLabel(dateOnly: string, pattern = "yyyy.MM.dd"): string {
  return formatInTimeZone(new Date(`${dateOnly}T12:00:00Z`), "UTC", pattern);
}

export function fmtDateTime(input: string | Date): string {
  return formatInTimeZone(toDate(input), getOwnerTz(), "yyyy.MM.dd HH:mm");
}

// Whole owner-local calendar days between today and `input` (negative = past).
//
// Exported so that anything ranking a date by urgency — a relative label, a
// colour, a sort — derives it from ONE definition of "which day". TaskRow used
// to label a chip via fmtRelativeDay while colouring it from its own
// differenceInCalendarDays over runtime-local dates, so the badge could read
// TOMORROW while painted due-today.
//
// Both sides are reduced to a bare YYYY-MM-DD first and parsed identically, so
// the subtraction is pure calendar arithmetic — no zone, no DST, no clock.
export function ownerDaysFromToday(input: string | Date): number {
  return differenceInCalendarDays(
    parseISO(ownerDayOf(input)),
    parseISO(todayISO()),
  );
}

export function fmtRelativeDay(input: string | Date): string {
  // Compare owner-local calendar days. Going through ownerDayOf (rather than
  // toZonedTime(toDate(input))) means a bare "YYYY-MM-DD" is taken at face
  // value instead of being read as runtime-local midnight and then shifted —
  // which reported YESTERDAY for today's own date whenever the owner's zone sat
  // west of the runtime.
  const day = ownerDayOf(input);
  const diff = ownerDaysFromToday(input);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  if (diff === -1) return "YESTERDAY";
  if (diff > 1 && diff <= 7) return `+${diff}D`;
  if (diff < -1 && diff >= -7) return `${diff}D`;
  return fmtDayLabel(day, "MMM d");
}

export function isDateToday(input: string | Date): boolean {
  return ownerDayOf(input) === todayISO();
}
