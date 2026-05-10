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

export function fmtCurrency(
  amount: number | string,
  currency = "USD",
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function nextOccurrenceForFixedExpense(
  cadence: "monthly" | "weekly" | "yearly",
  dayOfPeriod: number,
  from = new Date(),
): Date {
  const d = new Date(from);
  if (cadence === "monthly") {
    const target = new Date(d.getFullYear(), d.getMonth(), dayOfPeriod);
    if (target < startOfDay(d)) {
      target.setMonth(target.getMonth() + 1);
    }
    return target;
  }
  if (cadence === "weekly") {
    // dayOfPeriod = 0..6 (Sun..Sat)
    const target = new Date(d);
    const delta = (dayOfPeriod - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + (delta === 0 ? 7 : delta));
    return target;
  }
  // yearly: day-of-year approximation; treat dayOfPeriod as Mon-of-year (1..366)
  const target = new Date(d.getFullYear(), 0, dayOfPeriod);
  if (target < startOfDay(d)) target.setFullYear(target.getFullYear() + 1);
  return target;
}
