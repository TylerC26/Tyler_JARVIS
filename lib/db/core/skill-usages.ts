import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SkillUsage, SkillUsageOutcome } from "@/lib/db/types";

export type CreateSkillUsageInput = {
  skill_id: string;
  outcome: SkillUsageOutcome;
  critique?: string | null;
  user_text?: string | null;
  assistant_text?: string | null;
};

export async function recordSkillUsageCore(
  input: CreateSkillUsageInput,
): Promise<SkillUsage | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("skill_usages")
    .insert({
      owner_id: getOwnerId(),
      skill_id: input.skill_id,
      outcome: input.outcome,
      critique: input.critique ?? null,
      user_text: input.user_text ?? null,
      assistant_text: input.assistant_text ?? null,
    })
    .select()
    .single();

  if (error) {
    console.warn("[skill-usages] insert failed:", error.message);
    return null;
  }
  return data as SkillUsage;
}

export async function listRecentUsagesForSkillCore(
  skill_id: string,
  limit = 5,
): Promise<SkillUsage[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skill_usages")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("skill_id", skill_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as SkillUsage[] | null) ?? [];
}

// Returns the latest harmful critique for a skill IF its last 3 usages were
// all 'harmful'. Returns null otherwise. Drives the refinement banner shown
// in the skills UI.
export async function getHarmfulRunCritiqueCore(
  skill_id: string,
): Promise<string | null> {
  const recent = await listRecentUsagesForSkillCore(skill_id, 3);
  if (recent.length < 3) return null;
  if (recent.some((u) => u.outcome !== "harmful")) return null;
  return recent[0].critique ?? "Recent uses of this skill were judged unhelpful.";
}
