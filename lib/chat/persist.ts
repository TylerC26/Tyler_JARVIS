import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
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
    })
    .select()
    .single();
  if (error) {
    console.error("[chat] appendMessage failed:", error.message);
    return null;
  }
  return data as ChatMessage;
}

export async function listMessages(limit = 200): Promise<ChatMessage[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data as ChatMessage[] | null) ?? [];
  return rows.reverse();
}

export async function clearThread(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("owner_id", getOwnerId());
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
