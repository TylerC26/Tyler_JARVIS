import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  ChatAttachment,
  ChatMessage,
  ChatRole,
  ChatToolCall,
} from "@/lib/db/types";

export type AppendInput = {
  role: ChatRole;
  content?: string | null;
  tool_calls?: ChatToolCall[] | null;
  tool_call_id?: string | null;
  tool_name?: string | null;
  tool_result?: Record<string, unknown> | null;
  model?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  // null = main Jarvis thread; a slug scopes the row to one sub-agent thread.
  agent_slug?: string | null;
  // Images attached to a user turn, re-hosted in chat-uploads. See migration 0048.
  attachments?: ChatAttachment[] | null;
  // Author identity for team transcripts. null = derive from role; 'jarvis' =
  // the orchestrator; a slug = that sub-agent. See migration 0039.
  sender?: string | null;
};

export async function appendMessage(
  input: AppendInput,
): Promise<ChatMessage | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      owner_id: getOwnerId(),
      role: input.role,
      content: input.content ?? null,
      tool_calls: input.tool_calls ?? null,
      tool_call_id: input.tool_call_id ?? null,
      tool_name: input.tool_name ?? null,
      tool_result: input.tool_result ?? null,
      model: input.model ?? null,
      tokens_in: input.tokens_in ?? null,
      tokens_out: input.tokens_out ?? null,
      agent_slug: input.agent_slug ?? null,
      sender: input.sender ?? null,
      attachments: input.attachments ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("[chat] appendMessage failed:", error.message);
    return null;
  }
  return data as ChatMessage;
}

// List one thread's messages. `agentSlug` null → the main Jarvis thread
// (agent_slug IS NULL); a slug → that sub-agent's thread.
export async function listMessages(
  agentSlug: string | null = null,
  limit = 200,
): Promise<ChatMessage[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("chat_messages")
    .select("*")
    .eq("owner_id", getOwnerId());
  q = agentSlug === null ? q.is("agent_slug", null) : q.eq("agent_slug", agentSlug);
  const { data } = await q
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data as ChatMessage[] | null) ?? [];
  return rows.reverse();
}

// Slug of the thread with the most recent activity inside the window — "who
// was Tyler just talking to?". Returns null when the main Jarvis thread was
// most recent, undefined when there were no messages in the window at all.
// Used by the physique-photo ingress routing (lib/chat/physique-detect.ts).
export async function latestActiveThreadSlug(
  withinMinutes: number,
): Promise<string | null | undefined> {
  const supabase = await getSupabaseServer();
  if (!supabase) return undefined;
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const { data } = await supabase
    .from("chat_messages")
    .select("agent_slug")
    .eq("owner_id", getOwnerId())
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return undefined;
  return (data as { agent_slug: string | null }).agent_slug;
}

// Wipe one thread. `agentSlug` null → the main Jarvis thread only; a slug →
// that sub-agent's thread only. Other threads are left untouched.
export async function clearThread(
  agentSlug: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  let q = supabase.from("chat_messages").delete().eq("owner_id", getOwnerId());
  q = agentSlug === null ? q.is("agent_slug", null) : q.eq("agent_slug", agentSlug);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Wipe every sub-agent thread in one shot (agent_slug IS NOT NULL). The main
// Jarvis thread (agent_slug IS NULL) is left untouched — it has its own clear.
export async function clearAllAgentThreads(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("owner_id", getOwnerId())
    .not("agent_slug", "is", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
