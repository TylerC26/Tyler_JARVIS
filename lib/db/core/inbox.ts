// Inbox: the net under the orchestrator (migration 0068).
//
// Rows land here only when a turn carried substantive content and filed none of
// it. See lib/chat/inbox-fallback.ts for the decision; this file is storage.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  InboxItem,
  InboxSource,
  InboxSuggestedType,
} from "@/lib/db/types";

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CreateInboxInput = {
  source: InboxSource;
  body?: string | null;
  mediaUrl?: string | null;
  chatMessageId?: string | null;
  suggestedType?: InboxSuggestedType | null;
  suggestedJson?: Record<string, unknown> | null;
};

export async function createInboxItemCore(
  input: CreateInboxInput,
): Promise<CoreResult<InboxItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const { data, error } = await supabase
    .from("inbox")
    .insert({
      owner_id: getOwnerId(),
      source: input.source,
      body: input.body ?? null,
      media_url: input.mediaUrl ?? null,
      chat_message_id: input.chatMessageId ?? null,
      suggested_type: input.suggestedType ?? null,
      suggested_json: input.suggestedJson ?? null,
    })
    .select()
    .single();

  if (error) {
    // The partial unique index on (owner_id, chat_message_id) means a retried
    // turn is a no-op rather than a duplicate. Not an error worth surfacing.
    if (error.code === "23505") {
      return { ok: false, error: "Already captured." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: data as InboxItem };
}

export async function listPendingInboxCore(limit = 100): Promise<InboxItem[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("inbox")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("status", "pending")
    .order("received_at", { ascending: true })
    .limit(limit);
  return (data as InboxItem[] | null) ?? [];
}

export async function pendingInboxCountCore(): Promise<number> {
  const supabase = await getSupabaseServer();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("inbox")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", getOwnerId())
    .eq("status", "pending");
  return count ?? 0;
}

/** Stamp an item as filed into a real table. */
export async function markInboxFiledCore(
  id: string,
  filedType: string,
  filedId: string | null,
): Promise<CoreResult<InboxItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { data, error } = await supabase
    .from("inbox")
    .update({
      status: "filed",
      filed_type: filedType,
      filed_id: filedId,
      filed_at: new Date().toISOString(),
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InboxItem };
}

export async function discardInboxItemCore(
  id: string,
): Promise<CoreResult<InboxItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { data, error } = await supabase
    .from("inbox")
    .update({ status: "discarded" })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InboxItem };
}

/** Undo support for /triage — put a filed or discarded row back in the queue. */
export async function restoreInboxItemCore(
  id: string,
): Promise<CoreResult<InboxItem>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { data, error } = await supabase
    .from("inbox")
    .update({
      status: "pending",
      filed_type: null,
      filed_id: null,
      filed_at: null,
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InboxItem };
}
