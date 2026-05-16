// Vercel-side enqueue + read helpers for the repo_tasks queue. The Mac daemon
// owns the write side beyond status='queued' — it sets status, branch, logs,
// commit_sha, etc. as it runs. This module is just for inserting tasks and
// surfacing recent rows back to the chat tool / future admin UI.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { RepoTask, RepoTaskAgent } from "@/lib/db/types";

export type CreateRepoTaskInput = {
  repo_path: string;
  instruction: string;
  agent?: RepoTaskAgent;
  telegram_chat_id?: number | null;
  telegram_message_id?: number | null;
  chat_message_id?: string | null;
};

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createRepoTaskCore(
  input: CreateRepoTaskInput,
): Promise<CoreResult<RepoTask>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const instruction = input.instruction.trim();
  if (!instruction) return { ok: false, error: "Instruction is required." };
  if (!input.repo_path) return { ok: false, error: "repo_path is required." };

  const { data, error } = await supabase
    .from("repo_tasks")
    .insert({
      owner_id: getOwnerId(),
      repo_path: input.repo_path,
      instruction,
      agent: input.agent ?? "claude-code",
      telegram_chat_id: input.telegram_chat_id ?? null,
      telegram_message_id: input.telegram_message_id ?? null,
      chat_message_id: input.chat_message_id ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RepoTask };
}

export async function getRepoTaskCore(id: string): Promise<RepoTask | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("repo_tasks")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as RepoTask | null) ?? null;
}

export async function listRecentRepoTasksCore(limit = 50): Promise<RepoTask[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("repo_tasks")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("queued_at", { ascending: false })
    .limit(limit);
  return (data as RepoTask[] | null) ?? [];
}

// Cancel a queued task. Only allowed if still 'queued' — once the daemon flips
// it to 'claimed' or beyond, cancellation has no clean meaning (we'd have to
// SIGTERM the spawned agent, which is out of scope for v1).
export async function cancelRepoTaskCore(
  id: string,
): Promise<CoreResult<RepoTask>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("repo_tasks")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .eq("status", "queued")
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Task is not in 'queued' state — cannot cancel." };
  return { ok: true, data: data as RepoTask };
}

// Mark a failed task for cleanup. The Mac daemon picks this up via Realtime,
// stashes any dirty work as a safety net, hard-resets the working tree,
// deletes the leftover jarvis/* branch, and stamps cleanup_done_at.
export async function requestCleanupCore(
  id: string,
): Promise<CoreResult<RepoTask>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const src = await getRepoTaskCore(id);
  if (!src) return { ok: false, error: "Task not found." };
  if (src.status !== "failed") {
    return { ok: false, error: `Cleanup is only for failed tasks (this one is ${src.status}).` };
  }
  if (!src.branch) {
    return { ok: false, error: "This task didn't create a branch — nothing to clean up." };
  }
  if (src.cleanup_requested_at && !src.cleanup_done_at && !src.cleanup_error) {
    return { ok: false, error: "Cleanup already in progress." };
  }

  const { data, error } = await supabase
    .from("repo_tasks")
    .update({
      cleanup_requested_at: new Date().toISOString(),
      cleanup_done_at: null,
      cleanup_error: null,
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RepoTask };
}

// Re-enqueue a fresh task using the source row's instruction + repo + agent.
// The original row is left intact for history; a new row is created with
// status='queued'.
export async function retryRepoTaskCore(
  id: string,
): Promise<CoreResult<RepoTask>> {
  const src = await getRepoTaskCore(id);
  if (!src) return { ok: false, error: "Source task not found." };

  return createRepoTaskCore({
    repo_path: src.repo_path,
    instruction: src.instruction,
    agent: src.agent,
    telegram_chat_id: src.telegram_chat_id,
    telegram_message_id: src.telegram_message_id,
    chat_message_id: src.chat_message_id,
  });
}
