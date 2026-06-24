// Per-call-site LLM model overrides. Sibling of site-settings.ts: one row per
// (owner, feature_key). Absent feature_key = 'auto' (the call-site's default).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ModelPref } from "@/lib/db/types";

export async function getModelPrefsCore(): Promise<Record<string, ModelPref>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return {};
  const { data } = await supabase
    .from("model_prefs")
    .select("feature_key, model_pref")
    .eq("owner_id", getOwnerId());
  const out: Record<string, ModelPref> = {};
  for (const row of (data as { feature_key: string; model_pref: ModelPref }[] | null) ??
    []) {
    out[row.feature_key] = row.model_pref;
  }
  return out;
}

export async function setModelPrefCore(
  featureKey: string,
  modelPref: ModelPref,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase.from("model_prefs").upsert(
    {
      owner_id: getOwnerId(),
      feature_key: featureKey,
      model_pref: modelPref,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,feature_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
