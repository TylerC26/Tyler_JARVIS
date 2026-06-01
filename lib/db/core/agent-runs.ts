import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AgentRun, AgentRunStatus } from "@/lib/db/types";

// The agent_runs table is pure telemetry for the dashboard Agent Ops Board.
// Every write here is best-effort: if Supabase is unconfigured, the table is
// missing (migration not yet applied), or the insert fails, we swallow it and
// return a null/no-op. Logging a run must NEVER break the actual agent run.

export type StartAgentRunInput = {
  agentSlug: string;
  agentName: string;
  agentColor?: string | null;
  trigger?: string;
  task?: string | null;
};

// Log the start of a sub-agent run; returns its id so the caller can close it
// out, or null if the row couldn't be written.
export async function startAgentRunCore(
  input: StartAgentRunInput,
): Promise<string | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        owner_id: getOwnerId(),
        agent_slug: input.agentSlug,
        agent_name: input.agentName,
        agent_color: input.agentColor ?? null,
        trigger_source: input.trigger ?? "chat",
        task: input.task?.slice(0, 600) ?? null,
        status: "running",
      })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export type FinishAgentRunInput = {
  status: AgentRunStatus;
  toolCalls?: string[];
  resultSummary?: string | null;
};

// Close out a run started with startAgentRunCore. No-op when id is null.
export async function finishAgentRunCore(
  id: string | null,
  input: FinishAgentRunInput,
): Promise<void> {
  if (!id) return;
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  const tools = input.toolCalls ?? [];
  try {
    await supabase
      .from("agent_runs")
      .update({
        status: input.status,
        tool_calls: tools,
        tool_calls_count: tools.length,
        result_summary: input.resultSummary?.slice(0, 500) ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq("owner_id", getOwnerId())
      .eq("id", id);
  } catch {
    /* best-effort telemetry */
  }
}

// Recent runs, most-recent-first. Powers the dashboard Agent Ops Board poll.
export async function listRecentAgentRunsCore(limit = 12): Promise<AgentRun[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("owner_id", getOwnerId())
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data as AgentRun[] | null) ?? [];
  } catch {
    return [];
  }
}
