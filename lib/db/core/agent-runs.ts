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

// A run that never recorded a terminal status is orphaned: the request was
// torn down (page closed, serverless timeout) before finishAgentRunCore — or
// its catch — could fire, so the row is stuck at 'running' and the Ops Board
// pulses it as "working" forever. A chat turn is capped at 60s (maxDuration),
// so anything still 'running' well past that is provably dead. This is the
// margin past which we sweep such rows to a terminal state.
const STALE_RUN_MS = 90_000;

// Finalize orphaned 'running' rows older than the stale cutoff. Best-effort and
// idempotent (matches 0 rows in the common case). Called on every read so the
// board self-heals on the next poll instead of needing a separate cron sweep.
async function reapStaleAgentRunsCore(): Promise<void> {
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  try {
    await supabase
      .from("agent_runs")
      .update({
        status: "error",
        result_summary: "interrupted — no completion signal (page closed or timed out)",
        ended_at: new Date().toISOString(),
      })
      .eq("owner_id", getOwnerId())
      .eq("status", "running")
      .lt("started_at", cutoff);
  } catch {
    /* best-effort telemetry cleanup */
  }
}

// Recent runs, most-recent-first. Powers the dashboard Agent Ops Board poll.
// Reaps orphaned 'running' rows first so a delegation interrupted by a page
// switch settles to a terminal state instead of pulsing "working" forever.
export async function listRecentAgentRunsCore(limit = 12): Promise<AgentRun[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  await reapStaleAgentRunsCore();
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
