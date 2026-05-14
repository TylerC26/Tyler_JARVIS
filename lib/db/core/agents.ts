import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Agent, AgentModelPref, AgentSource } from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateAgentInput = {
  name: string;
  slug?: string;
  description: string;
  system_prompt: string;
  tool_allowlist: string[];
  model_pref?: AgentModelPref;
  color?: string | null;
  active?: boolean;
  source?: AgentSource;
};

export type UpdateAgentInput = Partial<
  Pick<
    Agent,
    | "name"
    | "description"
    | "system_prompt"
    | "tool_allowlist"
    | "model_pref"
    | "color"
    | "active"
  >
>;

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function dedupeTools(tools: string[]): string[] {
  return Array.from(
    new Set(tools.map((t) => t.trim()).filter((t) => t.length > 0)),
  );
}

export async function listAgentsCore(
  opts: { activeOnly?: boolean } = {},
): Promise<Agent[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("agents")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("source", { ascending: true })
    .order("name", { ascending: true });
  if (opts.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data as Agent[] | null) ?? [];
}

export async function getAgentCore(
  idOrSlug: string,
): Promise<Agent | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const filter = idOrSlug.includes("-") && idOrSlug.length === 36 ? "id" : "slug";
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq(filter, idOrSlug)
    .maybeSingle();
  return (data as Agent | null) ?? null;
}

export async function createAgentCore(
  input: CreateAgentInput,
): Promise<CoreResult<Agent>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const description = input.description.trim();
  if (!description) return { ok: false, error: "Description is required." };
  const system_prompt = input.system_prompt.trim();
  if (!system_prompt)
    return { ok: false, error: "System prompt is required." };

  const slug = (input.slug ? slugify(input.slug) : slugify(name)) || "agent";
  const tool_allowlist = dedupeTools(input.tool_allowlist);

  const { data, error } = await supabase
    .from("agents")
    .insert({
      owner_id: getOwnerId(),
      name,
      slug,
      description,
      system_prompt,
      tool_allowlist,
      model_pref: input.model_pref ?? "claude",
      color: input.color ?? null,
      active: input.active ?? true,
      source: input.source ?? "manual",
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Agent };
}

export async function updateAgentCore(
  id: string,
  patch: UpdateAgentInput,
): Promise<CoreResult<Agent>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Agent id is required." };

  const updates: Partial<Agent> = { updated_at: new Date().toISOString() };
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
  if (patch.system_prompt !== undefined) {
    const s = patch.system_prompt.trim();
    if (!s) return { ok: false, error: "System prompt cannot be empty." };
    updates.system_prompt = s;
  }
  if (patch.tool_allowlist !== undefined) {
    updates.tool_allowlist = dedupeTools(patch.tool_allowlist);
  }
  if (patch.model_pref !== undefined) updates.model_pref = patch.model_pref;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.active !== undefined) updates.active = patch.active;

  const { data, error } = await supabase
    .from("agents")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Agent };
}

export async function deleteAgentCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Agent id is required." };

  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Seeded agents inserted on first load. Idempotent: only fires when the owner
// has zero rows. Tool names must match keys in ALL_TOOLS (see lib/chat/tools.ts);
// unknown tool names in an allowlist are silently dropped by the runtime.
const SEED_AGENTS: CreateAgentInput[] = [
  {
    name: "Daily Planner",
    slug: "planner",
    description:
      "Proposes a time-boxed day plan honoring wife shifts and today's tasks.",
    system_prompt: `You are Tyler's Daily Planner sub-agent. You will be invoked by Jarvis (the orchestrator) with a task to plan part or all of a day.

Behavior:
- Call query_state with appropriate domains to gather tasks, events, and wife shifts before proposing anything.
- Build a numbered plan with explicit time ranges (e.g. "09:00–11:00 — deep work on X").
- Respect wife shift codes: A (07:00–15:00), P/P1 (afternoon to night), Anight/NO (overnight), DO (off).
- Output 6–10 lines max. End with one optional stretch goal.
- Do not invent commitments. If the day is light, say so.
- Return only the final plan as your response — no preamble, no closing pleasantry.`,
    tool_allowlist: ["query_state", "list_events_in_range", "list_wife_shifts", "add_task"],
    model_pref: "claude",
    color: "#7aa2ff",
    source: "seeded",
  },
  {
    name: "Scheduler",
    slug: "scheduler",
    description:
      "Finds free slots, schedules events, and reschedules conflicts honoring wife shifts.",
    system_prompt: `You are Tyler's Scheduler sub-agent. You will be invoked by Jarvis to schedule, move, or find time for events.

Behavior:
- Always call list_events_in_range before proposing a time, to confirm the slot is free.
- Always check list_wife_shifts when the event involves the wife.
- When creating events, pass ISO 8601 timestamps with Tyler's local offset (NOT trailing Z).
- Prefer evening/weekend slots for social, morning for deep work, afternoon for errands.
- Return a single sentence confirming what you scheduled (or what conflicts you found).`,
    tool_allowlist: [
      "list_events_in_range",
      "list_wife_shifts",
      "add_calendar_event",
      "update_event",
      "move_event",
    ],
    model_pref: "claude",
    color: "#00d9ff",
    source: "seeded",
  },
  {
    name: "Quick Capture",
    slug: "capture",
    description:
      "Splits a brain-dump into tasks and calendar events.",
    system_prompt: `You are Tyler's Quick Capture sub-agent. You will receive an unstructured brain-dump and must classify every actionable item.

Behavior:
- For each item, call exactly one tool: add_task or add_calendar_event.
- Infer sensible defaults (priority 3, 1-hour event duration).
- After all tool calls succeed, respond with one compact summary line like:
  "Captured: 3 tasks · 1 event."
- If anything is ambiguous, save the unambiguous items first, then ask for clarification at the end in one line.`,
    tool_allowlist: ["add_task", "add_calendar_event"],
    model_pref: "claude",
    color: "#f5b14d",
    source: "seeded",
  },
];

export async function seedDefaultAgentsCore(): Promise<
  CoreResult<{ inserted: number }>
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { count, error: countErr } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", getOwnerId());
  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) return { ok: true, data: { inserted: 0 } };

  const rows = SEED_AGENTS.map((a) => ({
    owner_id: getOwnerId(),
    name: a.name,
    slug: a.slug ?? slugify(a.name),
    description: a.description,
    system_prompt: a.system_prompt,
    tool_allowlist: dedupeTools(a.tool_allowlist),
    model_pref: a.model_pref ?? ("claude" as AgentModelPref),
    color: a.color ?? null,
    active: a.active ?? true,
    source: a.source ?? ("seeded" as AgentSource),
  }));

  const { error } = await supabase.from("agents").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { inserted: rows.length } };
}
