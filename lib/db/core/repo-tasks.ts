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

export async function listRecentRepoTasksCore(limit = 20): Promise<RepoTask[]> {
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
