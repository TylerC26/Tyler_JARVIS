import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  WFH_STATUS_CODES,
  type WfhStatus,
  type WfhStatusCode,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type WfhStatusInput = {
  status_date: string; // YYYY-MM-DD
  status: WfhStatusCode;
  note?: string | null;
  source?: string;
};

export async function upsertWfhStatusCore(
  entries: WfhStatusInput[],
): Promise<CoreResult<WfhStatus[]>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  if (entries.length === 0) return { ok: true, data: [] };

  const owner_id = getOwnerId();
  const rows = entries.map((e) => {
    if (!DATE_RE.test(e.status_date)) {
      throw new Error(
        `Invalid status_date (expected YYYY-MM-DD): ${e.status_date}`,
      );
    }
    if (!WFH_STATUS_CODES.includes(e.status)) {
      throw new Error(`Invalid WFH status: ${e.status}`);
    }
    return {
      owner_id,
      status_date: e.status_date,
      status: e.status,
      note: e.note ?? null,
      source: e.source ?? "agent",
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("wfh_status")
    .upsert(rows, { onConflict: "owner_id,status_date" })
    .select();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as WfhStatus[]) ?? [] };
}

export async function listWfhStatusInRangeCore(
  fromDate: string,
  toDate: string,
): Promise<WfhStatus[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("wfh_status")
    .select("*")
    .eq("owner_id", getOwnerId())
    .gte("status_date", fromDate)
    .lte("status_date", toDate)
    .order("status_date", { ascending: true });
  return (data as WfhStatus[] | null) ?? [];
}

export async function deleteWfhStatusInRangeCore(
  fromDate: string,
  toDate: string,
): Promise<CoreResult<number>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return { ok: false, error: "Dates must be YYYY-MM-DD." };
  }
  const { data, error } = await supabase
    .from("wfh_status")
    .delete()
    .eq("owner_id", getOwnerId())
    .gte("status_date", fromDate)
    .lte("status_date", toDate)
    .select("status_date");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as unknown[] | null)?.length ?? 0 };
}
