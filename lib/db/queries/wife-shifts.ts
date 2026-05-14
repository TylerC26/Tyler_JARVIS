import { daysFromTodayISO, todayISO } from "@/lib/date";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import type { WifeShift } from "@/lib/db/types";

export async function listWifeShifts(opts: {
  from: string;
  to: string;
}): Promise<WifeShift[]> {
  return listWifeShiftsInRangeCore(opts.from, opts.to);
}

export async function listUpcomingWifeShifts(days = 21): Promise<WifeShift[]> {
  // Range anchored to the owner's "today", not the server's UTC date.
  return listWifeShiftsInRangeCore(todayISO(), daysFromTodayISO(days - 1));
}
