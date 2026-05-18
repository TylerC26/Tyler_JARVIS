// Site-wide runtime toggles. Currently houses the Claude kill switch shown in
// the dashboard top-right StatusRail.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SiteSettings } from "@/lib/db/types";

const DEFAULTS: Omit<SiteSettings, "owner_id" | "created_at" | "updated_at"> = {
  claude_enabled: true,
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

export async function setClaudeEnabledCore(
  enabled: boolean,
): Promise<{ ok: true; data: SiteSettings } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("site_settings")
    .upsert(
      {
        owner_id: getOwnerId(),
        claude_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as SiteSettings };
}

// Async, DB-backed kill switch for Anthropic calls. Combines the env-key check
// with the runtime toggle. Used at every Claude call site.
export async function isClaudeEnabled(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    const s = await getSiteSettingsCore();
    return s.claude_enabled;
  } catch (e) {
    console.warn("[site] could not read claude_enabled, defaulting on:", e);
    return true;
  }
}
