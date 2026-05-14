// Cold-start-safe dedupe for the Telegram webhook. Telegram resends an Update
// if the webhook doesn't 2xx fast enough; an in-memory Set wouldn't survive
// serverless cold starts, so we claim each update_id in a tiny Postgres table.

import { getSupabaseServer } from "@/lib/supabase/server";

// Try to claim an update_id. Returns true if this is the first time we've seen
// it (caller should process), false if it's a duplicate retry (caller skips).
//
// Fail-open: if the DB is unreachable or the table is missing, return true and
// log — a rare double-process is far better than silently dropping every
// message because dedupe is broken.
export async function claimUpdate(updateId: number): Promise<boolean> {
  const supabase = await getSupabaseServer();
  if (!supabase) {
    console.warn("[telegram] dedupe: Supabase not configured, failing open");
    return true;
  }

  const { error } = await supabase
    .from("telegram_updates")
    .insert({ update_id: updateId });

  if (!error) return true;

  // 23505 = unique_violation → we've already claimed this update_id.
  if (error.code === "23505") return false;

  console.warn("[telegram] dedupe insert failed, failing open:", error.message);
  return true;
}
