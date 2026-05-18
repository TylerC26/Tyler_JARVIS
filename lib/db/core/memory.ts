import { getOwnerId } from "@/lib/auth/currentUser";
import { embedText } from "@/lib/ai/embeddings";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  MemoryConfidence,
  MemoryEntry,
  MemoryKind,
  MemoryScope,
  MemorySource,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

// Embed a freshly-written memory and store the vector. Fire-and-forget.
async function backfillEmbedding(id: string, text: string): Promise<void> {
  const vec = await embedText(text);
  if (!vec) return;
  const supabase = await getSupabaseServer();
  if (!supabase) return;
  await supabase
    .from("memory_entries")
    .update({ embedding: vec as unknown as number[] })
    .eq("owner_id", getOwnerId())
    .eq("id", id);
}

function embedTextForMemory(key: string, value: string): string {
  return `${key.trim()}: ${value.trim()}`;
}

export type CreateMemoryInput = {
  scope?: MemoryScope;
  kind: MemoryKind;
  key: string;
  value: string;
  source: MemorySource;
  confidence?: MemoryConfidence;
  pinned?: boolean;
};

export type UpdateMemoryInput = Partial<
  Pick<MemoryEntry, "scope" | "kind" | "key" | "value" | "confidence" | "pinned">
>;

export async function listMemoriesCore(
  opts: { scope?: MemoryScope } = {},
): Promise<MemoryEntry[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("memory_entries")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("pinned", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts.scope) q = q.eq("scope", opts.scope);
  const { data } = await q;
  return (data as MemoryEntry[] | null) ?? [];
}

export async function createMemoryCore(
  input: CreateMemoryInput,
): Promise<CoreResult<MemoryEntry>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const key = input.key.trim();
  if (!key) return { ok: false, error: "Key is required." };
  const value = input.value.trim();
  if (!value) return { ok: false, error: "Value is required." };

  const { data, error } = await supabase
    .from("memory_entries")
    .insert({
      owner_id: getOwnerId(),
      scope: input.scope ?? "global",
      kind: input.kind,
      key,
      value,
      source: input.source,
      confidence: input.confidence ?? "medium",
      pinned: input.pinned ?? false,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as MemoryEntry;
  void backfillEmbedding(row.id, embedTextForMemory(row.key, row.value));
  return { ok: true, data: row };
}

export async function updateMemoryCore(
  id: string,
  patch: UpdateMemoryInput,
): Promise<CoreResult<MemoryEntry>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Memory id is required." };

  const updates: Partial<MemoryEntry> = { updated_at: new Date().toISOString() };
  if (patch.scope !== undefined) updates.scope = patch.scope;
  if (patch.kind !== undefined) updates.kind = patch.kind;
  if (patch.key !== undefined) {
    const k = patch.key.trim();
    if (!k) return { ok: false, error: "Key cannot be empty." };
    updates.key = k;
  }
  if (patch.value !== undefined) {
    const v = patch.value.trim();
    if (!v) return { ok: false, error: "Value cannot be empty." };
    updates.value = v;
  }
  if (patch.confidence !== undefined) updates.confidence = patch.confidence;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;

  const { data, error } = await supabase
    .from("memory_entries")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as MemoryEntry;
  if (patch.key !== undefined || patch.value !== undefined) {
    void backfillEmbedding(row.id, embedTextForMemory(row.key, row.value));
  }
  return { ok: true, data: row };
}

export async function deleteMemoryCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Memory id is required." };

  const { error } = await supabase
    .from("memory_entries")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Entries for prefix injection. When `userText` is provided and an embedding
// can be computed, blends two sources: (a) all pinned entries, (b) top
// cosine-similarity neighbours of the user message. Falls back to the
// recency-only ordering when embedding is unavailable or no userText is
// passed. Bumps last_used_at on whatever rows it returns so the next round
// rotates the recency window forward.
export async function getTopMemoriesForPrefix(
  limit = 8,
  userText?: string,
): Promise<MemoryEntry[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  let rows: MemoryEntry[] = [];

  const trimmed = userText?.trim() ?? "";
  if (trimmed) {
    const vec = await embedText(trimmed);
    if (vec) {
      const [pinned, matches] = await Promise.all([
        supabase
          .from("memory_entries")
          .select("*")
          .eq("owner_id", getOwnerId())
          .eq("scope", "global")
          .eq("pinned", true),
        supabase.rpc("match_memories", {
          query_embedding: vec as unknown as number[],
          owner: getOwnerId(),
          match_count: limit,
        }),
      ]);
      const pinnedRows = (pinned.data as MemoryEntry[] | null) ?? [];
      const matchRows = (matches.data as MemoryEntry[] | null) ?? [];
      const seen = new Set<string>();
      const merged: MemoryEntry[] = [];
      for (const r of pinnedRows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push(r);
      }
      for (const r of matchRows) {
        if (merged.length >= limit) break;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push(r);
      }
      rows = merged;
    }
  }

  if (rows.length === 0) {
    const { data } = await supabase
      .from("memory_entries")
      .select("*")
      .eq("owner_id", getOwnerId())
      .eq("scope", "global")
      .order("pinned", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = (data as MemoryEntry[] | null) ?? [];
  }

  if (rows.length === 0) return [];

  // Fire-and-forget usage bump. Don't await — we don't want to delay the chat.
  const ids = rows.map((r) => r.id);
  const now = new Date().toISOString();
  void supabase
    .from("memory_entries")
    .update({ last_used_at: now })
    .in("id", ids);

  return rows;
}
