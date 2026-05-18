import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ChatMessage, ChatRole } from "@/lib/db/types";

const SNIPPET_LEN = 240;

export type ChatSearchHit = {
  id: string;
  created_at: string;
  role: ChatRole;
  snippet: string;
  agent_slug: string | null;
};

export type ChatSearchOptions = {
  query: string;
  since?: string;
  until?: string;
  agent_slug?: string | null;
  limit?: number;
};

export async function searchChatMessagesCore(
  opts: ChatSearchOptions,
): Promise<ChatSearchHit[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  const trimmed = opts.query.trim();
  if (!trimmed) return [];

  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 25);

  let q = supabase
    .from("chat_messages")
    .select("id, created_at, role, content, agent_slug")
    .eq("owner_id", getOwnerId())
    .not("content", "is", null)
    .textSearch("content_tsv", trimmed, { type: "plain", config: "english" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.since) q = q.gte("created_at", opts.since);
  if (opts.until) q = q.lt("created_at", opts.until);
  if (opts.agent_slug !== undefined) {
    q = opts.agent_slug === null
      ? q.is("agent_slug", null)
      : q.eq("agent_slug", opts.agent_slug);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[chat-search] failed:", error.message);
    return [];
  }

  type Row = Pick<ChatMessage, "id" | "created_at" | "role" | "content" | "agent_slug">;
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    role: r.role,
    agent_slug: r.agent_slug,
    snippet: truncate(r.content ?? "", SNIPPET_LEN),
  }));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
