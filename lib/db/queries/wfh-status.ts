import { daysFromTodayISO, todayISO } from "@/lib/date";
import { listWfhStatusInRangeCore } from "@/lib/db/core/wfh-status";
import type { WfhStatus } from "@/lib/db/types";

export async function listWfhStatus(opts: {
  from: string;
  to: string;
}): Promise<WfhStatus[]> {
  return listWfhStatusInRangeCore(opts.from, opts.to);
}

export async function listUpcomingWfhStatus(days = 21): Promise<WfhStatus[]> {
  // Range anchored to the owner's "today", not the server's UTC date.
  return listWfhStatusInRangeCore(todayISO(), daysFromTodayISO(days - 1));
}
