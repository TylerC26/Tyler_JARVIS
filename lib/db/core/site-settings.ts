// Site-wide runtime toggles. Currently houses the MiniMax kill switch shown in
// the dashboard top-right StatusRail (formerly the Claude kill switch —
// claude_enabled is left in the table, unused, after the Claude->MiniMax
// migration; minimax_enabled is the live column).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SiteSettings } from "@/lib/db/types";

const DEFAULTS: Omit<SiteSettings, "owner_id" | "created_at" | "updated_at"> = {
  claude_enabled: true,
  minimax_enabled: true,
};

export async function getSiteSettingsCore(): Promise<SiteSettings> {
  const supabase = await getSupabaseServer();
  const owner_id = getOwnerId();
  const empty: SiteSettings = {
    owner_id,
    ...DEFAULTS,
    created_at: new Date().toISOString(),
    updated_at: null,
  };
  if (!supabase) return empty;
  const { data } = await supabase
    .from("site_settings")
    .select("*")
    .eq("owner_id", owner_id)
    .maybeSingle();
  return (data as SiteSettings | null) ?? empty;
}

export async function setMinimaxEnabledCore(
  enabled: boolean,
): Promise<{ ok: true; data: SiteSettings } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("site_settings")
    .upsert(
      {
        owner_id: getOwnerId(),
        minimax_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as SiteSettings };
}

// Async, DB-backed kill switch for MiniMax calls. Combines the env-key check
// with the runtime toggle. Used at every MiniMax call site (memory
// reconciliation, skill judge/propose, agent draft, briefs, extractors, etc.).
export async function isMinimaxEnabled(): Promise<boolean> {
  if (!process.env.MINIMAX_API_KEY) return false;
  try {
    const s = await getSiteSettingsCore();
    return s.minimax_enabled;
  } catch (e) {
    console.warn("[site] could not read minimax_enabled, defaulting on:", e);
    return true;
  }
}
