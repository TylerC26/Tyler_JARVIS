import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { PromptSettings } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type PromptSettingsPatch = {
  orchestrator_prompt?: string | null;
  responder_prompt?: string | null;
  prefix_addendum?: string | null;
  morning_brief_prompt?: string | null;
  evening_brief_prompt?: string | null;
};

// Always returns a settings shape — if no row exists yet, returns an object
// with all-null overrides so callers can treat it uniformly.
export async function getPromptSettingsCore(): Promise<PromptSettings> {
  const supabase = await getSupabaseServer();
  const empty: PromptSettings = {
    owner_id: getOwnerId(),
    orchestrator_prompt: null,
    responder_prompt: null,
    prefix_addendum: null,
    morning_brief_prompt: null,
    evening_brief_prompt: null,
    created_at: new Date().toISOString(),
    updated_at: null,
  };
  if (!supabase) return empty;
  const { data } = await supabase
    .from("prompt_settings")
    .select("*")
    .eq("owner_id", getOwnerId())
    .maybeSingle();
  return (data as PromptSettings | null) ?? empty;
}

// Treat blank/whitespace strings as "clear the override" — saves the user from
// accidentally bricking Jarvis with an empty textarea.
function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : value;
}

export async function upsertPromptSettingsCore(
  patch: PromptSettingsPatch,
): Promise<CoreResult<PromptSettings>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const owner_id = getOwnerId();
  const row: Partial<PromptSettings> & { owner_id: string } = {
    owner_id,
    updated_at: new Date().toISOString(),
  };
  if (patch.orchestrator_prompt !== undefined)
    row.orchestrator_prompt = normalize(patch.orchestrator_prompt);
  if (patch.responder_prompt !== undefined)
    row.responder_prompt = normalize(patch.responder_prompt);
  if (patch.prefix_addendum !== undefined)
    row.prefix_addendum = normalize(patch.prefix_addendum);
  if (patch.morning_brief_prompt !== undefined)
    row.morning_brief_prompt = normalize(patch.morning_brief_prompt);
  if (patch.evening_brief_prompt !== undefined)
    row.evening_brief_prompt = normalize(patch.evening_brief_prompt);

  const { data, error } = await supabase
    .from("prompt_settings")
    .upsert(row, { onConflict: "owner_id" })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PromptSettings };
}
