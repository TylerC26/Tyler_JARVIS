import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { WifeShift, WifeShiftCode } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CODES: WifeShiftCode[] = ["A", "P", "N", "DO"];

export type WifeShiftInput = {
  shift_date: string; // YYYY-MM-DD
  code: WifeShiftCode;
  raw_label?: string | null;
  note?: string | null;
  source?: string;
};

export async function upsertWifeShiftsCore(
  shifts: WifeShiftInput[],
): Promise<CoreResult<WifeShift[]>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  if (shifts.length === 0) return { ok: true, data: [] };

  const owner_id = getOwnerId();
  const rows = shifts.map((s) => {
    if (!DATE_RE.test(s.shift_date)) {
      throw new Error(`Invalid shift_date (expected YYYY-MM-DD): ${s.shift_date}`);
    }
    if (!VALID_CODES.includes(s.code)) {
      throw new Error(`Invalid shift code: ${s.code}`);
    }
    return {
      owner_id,
      shift_date: s.shift_date,
      code: s.code,
      raw_label: s.raw_label ?? null,
      note: s.note ?? null,
      source: s.source ?? "ocr",
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("wife_shifts")
    .upsert(rows, { onConflict: "owner_id,shift_date" })
    .select();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data as WifeShift[]) ?? [] };
}

export async function listWifeShiftsInRangeCore(
  fromDate: string,
  toDate: string,
): Promise<WifeShift[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("wife_shifts")
    .select("*")
    .eq("owner_id", getOwnerId())
    .gte("shift_date", fromDate)
    .lte("shift_date", toDate)
    .order("shift_date", { ascending: true });
  return (data as WifeShift[] | null) ?? [];
}

export async function deleteWifeShiftCore(
  shiftDate: string,
): Promise<CoreResult<true>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("wife_shifts")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("shift_date", shiftDate);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: true };
}
