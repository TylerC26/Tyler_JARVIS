import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Skill, SkillSource } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateSkillInput = {
  name: string;
  description: string;
  instructions: string;
  trigger_keywords: string[];
  active?: boolean;
  source?: SkillSource;
};

export type UpdateSkillInput = Partial<
  Pick<
    Skill,
    "name" | "description" | "instructions" | "trigger_keywords" | "active"
  >
>;

function normalizeTriggers(triggers: string[]): string[] {
  return Array.from(
    new Set(
      triggers
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0),
    ),
  );
}

export async function listSkillsCore(
  opts: { activeOnly?: boolean } = {},
): Promise<Skill[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("skills")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("name", { ascending: true });
  if (opts.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data as Skill[] | null) ?? [];
}

export async function getSkillCore(id: string): Promise<Skill | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("skills")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Skill | null) ?? null;
}

export async function createSkillCore(
  input: CreateSkillInput,
): Promise<CoreResult<Skill>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Description is required." };
  const instructions = input.instructions.trim();
  if (!instructions) return { ok: false, error: "Instructions are required." };
  const triggers = normalizeTriggers(input.trigger_keywords);
  if (triggers.length === 0)
    return { ok: false, error: "At least one trigger keyword is required." };

  const { data, error } = await supabase
    .from("skills")
    .insert({
      owner_id: getOwnerId(),
      name,
      description,
      instructions,
      trigger_keywords: triggers,
      active: input.active ?? true,
      source: input.source ?? "manual",
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Skill };
}

export async function updateSkillCore(
  id: string,
  patch: UpdateSkillInput,
): Promise<CoreResult<Skill>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Skill id is required." };

  const updates: Partial<Skill> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "Name cannot be empty." };
    updates.name = n;
  }
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (!d) return { ok: false, error: "Description cannot be empty." };
    updates.description = d;
  }
  if (patch.instructions !== undefined) {
    const i = patch.instructions.trim();
    if (!i) return { ok: false, error: "Instructions cannot be empty." };
    updates.instructions = i;
  }
  if (patch.trigger_keywords !== undefined) {
    const t = normalizeTriggers(patch.trigger_keywords);
    if (t.length === 0)
      return { ok: false, error: "At least one trigger keyword is required." };
    updates.trigger_keywords = t;
  }
  if (patch.active !== undefined) updates.active = patch.active;

  const { data, error } = await supabase
    .from("skills")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Skill };
}

export async function deleteSkillCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Skill id is required." };

  const { error } = await supabase
    .from("skills")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// The seed skills shipped on first load. Idempotent: only inserted when the
// owner has zero rows in `skills`. Tyler can edit, disable, or delete any of
// these afterwards. Daily-planning and quick-capture behaviors ship as Agents
// (see SEED_AGENTS in core/agents.ts), not Skills — keeping each concept in
// exactly one system avoids the agent/skill duplication.
const SEED_SKILLS: CreateSkillInput[] = [
  {
    name: "Weekly Review",
    description:
      "Sunday-style retrospective: what got done, what slipped, what's next.",
    trigger_keywords: ["weekly review", "review my week", "how was my week", "week recap"],
    instructions: `You are running Tyler's Weekly Review.

When triggered:
- Use query_state (domain: all) to pull tasks, events, and projects for the week.
- Structure the response in three short sections:
  1. **Done** — tasks marked complete in the last 7 days. List up to 5.
  2. **Slipped** — overdue tasks still open. Be honest, not harsh.
  3. **Next week** — 2-3 priorities to carry forward.
- Keep the whole reply under 200 words. Use plain bullets, not nested formatting.
- End with one question that prompts reflection (e.g. "What's the one thing you'd repeat?").`,
    source: "seeded",
  },
  {
    name: "Date Night Planner",
    description:
      "Scans wife's 14-day shift window and surfaces 2–3 best evening slots for date night.",
    trigger_keywords: ["date night", "dinner with wife", "when can we go out", "plan a date"],
    instructions: `You are planning a date night for Tyler and his wife.

When triggered:
- Read her 14-day shift schedule from the context prefix.
- Score each evening:
  - A days (07:00–15:00): free in the evening — strong candidate.
  - P / P1 days (mid-afternoon to night): NOT available evenings.
  - Anight / NO days: she works overnight, often sleeps in the day after — avoid.
  - DO days: best — fully free.
- Pick the 2-3 best evenings in the next 14 days. Prefer Fridays and Saturdays when DO/A days fall on them.
- For each pick, give a one-line suggestion (dinner out, movie, walk, etc.) loosely matched to the day type.
- Output format: a short table or bullet list with date, day of week, shift status, suggested activity.
- If no good slots exist in the window, say so and suggest the nearest viable date beyond it.`,
    source: "seeded",
  },
];

export async function seedDefaultSkillsCore(): Promise<CoreResult<{ inserted: number }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { count, error: countErr } = await supabase
    .from("skills")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", getOwnerId());
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) return { ok: true, data: { inserted: 0 } };

  const rows = SEED_SKILLS.map((s) => ({
    owner_id: getOwnerId(),
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    trigger_keywords: normalizeTriggers(s.trigger_keywords),
    active: true,
    source: s.source ?? "seeded",
  }));

  const { error } = await supabase.from("skills").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { inserted: rows.length } };
}
