import { addDays, format } from "date-fns";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import type { WifeShift } from "@/lib/db/types";

export async function listWifeShifts(opts: {
  from: string;
  to: string;
}): Promise<WifeShift[]> {
  return listWifeShiftsInRangeCore(opts.from, opts.to);
}

export async function listUpcomingWifeShifts(days = 21): Promise<WifeShift[]> {
  const today = new Date();
  const from = format(today, "yyyy-MM-dd");
  const to = format(addDays(today, days - 1), "yyyy-MM-dd");
  return listWifeShiftsInRangeCore(from, to);
}
