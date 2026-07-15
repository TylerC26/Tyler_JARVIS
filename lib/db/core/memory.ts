import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  embedText,
  isEmbeddingConfigured,
} from "@/lib/ai/embeddings";
import type {
  MemoryConfidence,
  MemoryEntry,
  MemoryKind,
  MemoryScope,
  MemorySource,
  MemoryStatus,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

// Columns for read paths — everything except the 1536-float `embedding`
// vector, which is large and never rendered. Write paths (.select() after
// insert/update) still pull the full row, but only one at a time.
const READ_COLUMNS =
  "id,owner_id,scope,kind,key,value,topic,subtopic,source,confidence,pinned," +
  "status,superseded_by,details,used_count,last_used_at,created_at,updated_at";

export type CreateMemoryInput = {
  scope?: MemoryScope;
  kind: MemoryKind;
  key: string;
  value: string;
  // Topic hierarchy (see MEMORY_TOPICS). Reuse an existing topic/subtopic
  // whenever the fact fits one; only coin a new topic when none applies.
  topic?: string | null;
  subtopic?: string | null;
  source: MemorySource;
  confidence?: MemoryConfidence;
  pinned?: boolean;
  details?: Record<string, unknown>;
};

export type UpdateMemoryInput = Partial<
  Pick<
    MemoryEntry,
    | "scope"
    | "kind"
    | "key"
    | "value"
    | "topic"
    | "subtopic"
    | "confidence"
    | "pinned"
    | "details"
  >
>;

// Normalize a topic/subtopic into a stable slug (lowercase, trimmed, spaces →
// hyphens). Keeps grouping greppable and prevents "DC Commissioning" vs
// "dc-commissioning" drift. Returns null for empty/absent input.
function normalizeSlug(s: string | null | undefined): string | null {
  if (s == null) return null;
  const v = s.trim().toLowerCase().replace(/\s+/g, "-");
  return v || null;
}

export type ListMemoriesOptions = {
  scope?: MemoryScope;
  // Lifecycle states to include. Defaults to ['active'].
  statuses?: MemoryStatus[];
  kind?: MemoryKind;
};

// A prefix/search memory, optionally annotated with the cosine similarity that
// surfaced it (absent when it came in via pin or recency).
export type PrefixMemory = MemoryEntry & { similarity?: number };

// The text we embed for a memory: "key: value". The same join is used for the
// query side so both live in one consistent vector space.
function memoryEmbedInput(key: string, value: string): string {
  return `${key}: ${value}`;
}

// Fire-and-forget: embed a memory row and write the vector back. Safe to call
// without awaiting — failures are swallowed so they never break the caller.
function backfillEmbedding(id: string, key: string, value: string): void {
  if (!isEmbeddingConfigured()) return;
  void (async () => {
    try {
      const vec = await embedText(memoryEmbedInput(key, value));
      if (!vec) return;
      const supabase = await getSupabaseServer();
      if (!supabase) return;
      await supabase
        .from("memory_entries")
        .update({ embedding: vec })
        .eq("owner_id", getOwnerId())
        .eq("id", id);
    } catch (e) {
      console.warn("[memory] embedding backfill failed:", e);
    }
  })();
}

export async function listMemoriesCore(
  opts: ListMemoriesOptions = {},
): Promise<MemoryEntry[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const statuses = opts.statuses ?? ["active"];
  let q = supabase
    .from("memory_entries")
    .select(READ_COLUMNS)
    .eq("owner_id", getOwnerId())
    .in("status", statuses)
    .order("pinned", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts.scope) q = q.eq("scope", opts.scope);
  if (opts.kind) q = q.eq("kind", opts.kind);
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
      topic: normalizeSlug(input.topic),
      subtopic: normalizeSlug(input.subtopic),
      source: input.source,
      confidence: input.confidence ?? "medium",
      pinned: input.pinned ?? false,
      status: "active",
      details: input.details ?? {},
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as MemoryEntry;
  backfillEmbedding(row.id, row.key, row.value);
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
  if (patch.topic !== undefined) updates.topic = normalizeSlug(patch.topic);
  if (patch.subtopic !== undefined)
    updates.subtopic = normalizeSlug(patch.subtopic);
  if (patch.confidence !== undefined) updates.confidence = patch.confidence;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;
  if (patch.details !== undefined) updates.details = patch.details;

  const { data, error } = await supabase
    .from("memory_entries")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as MemoryEntry;
  // Re-embed only when the semantic content changed.
  if (patch.key !== undefined || patch.value !== undefined) {
    backfillEmbedding(row.id, row.key, row.value);
  }
  return { ok: true, data: row };
}

// Flip a memory's lifecycle status. Generic helper behind archive / restore.
export async function setMemoryStatusCore(
  id: string,
  status: MemoryStatus,
): Promise<CoreResult<MemoryEntry>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Memory id is required." };
  const { data, error } = await supabase
    .from("memory_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as MemoryEntry };
}

// Soft-delete: flip status to 'archived'. The row stays for the /memory UI and
// can be restored. The `forget` chat tool routes here.
export async function archiveMemoryCore(
  id: string,
): Promise<CoreResult<MemoryEntry>> {
  return setMemoryStatusCore(id, "archived");
}

// Replace a stale memory: create the corrected entry, then mark the old row
// 'superseded' with a pointer to the replacement. Used by reconciliation when
// a previously-stored fact turns out to be wrong.
export async function supersedeMemoryCore(
  oldId: string,
  input: CreateMemoryInput,
): Promise<CoreResult<MemoryEntry>> {
  const created = await createMemoryCore(input);
  if (!created.ok) return created;
  const supabase = await getSupabaseServer();
  if (supabase) {
    await supabase
      .from("memory_entries")
      .update({
        status: "superseded",
        superseded_by: created.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", getOwnerId())
      .eq("id", oldId);
  }
  return created;
}

// Hard delete — permanent. Kept for the /memory UI's explicit "delete" action;
// the chat `forget` tool uses archiveMemoryCore instead.
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

// Fire-and-forget usage bump via the bump_memory_usage RPC: increments
// used_count and stamps last_used_at in one round-trip.
function bumpUsage(ids: string[]): void {
  if (ids.length === 0) return;
  void (async () => {
    try {
      const supabase = await getSupabaseServer();
      if (!supabase) return;
      await supabase.rpc("bump_memory_usage", { ids });
    } catch (e) {
      console.warn("[memory] usage bump failed:", e);
    }
  })();
}

// Semantic id lookup via the match_memories RPC. Returns id→similarity for the
// top matches, or an empty map when embeddings are unconfigured / the call
// fails — callers then fall back to recency / keyword logic.
async function semanticMatchIds(
  query: string,
  matchCount: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!isEmbeddingConfigured()) return out;
  const trimmed = query.trim();
  if (!trimmed) return out;
  try {
    const vec = await embedText(trimmed);
    if (!vec) return out;
    const supabase = await getSupabaseServer();
    if (!supabase) return out;
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: vec,
      owner: getOwnerId(),
      match_count: matchCount,
    });
    if (error || !data) return out;
    for (const row of data as Array<{ id: string; similarity: number }>) {
      out.set(row.id, row.similarity);
    }
  } catch (e) {
    console.warn("[memory] semantic match failed:", e);
  }
  return out;
}

// Memories for system-prefix injection.
//
// Small store (<= limit): the whole active set fits in the prefix, so it is
// injected wholesale and the embedding round-trip is skipped entirely —
// semantic ranking only earns its latency once the store outgrows `limit`.
//
// Large store: rank by three signals — every pinned entry (always in), then
// semantic matches against the user's turn, then a recency backfill — deduped
// and capped at `limit`. Usage is bumped on whatever is returned.
export async function getMemoriesForPrefix(
  userText: string,
  limit = 40,
): Promise<PrefixMemory[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  const { data } = await supabase
    .from("memory_entries")
    .select(READ_COLUMNS)
    .eq("owner_id", getOwnerId())
    .eq("scope", "global")
    .eq("status", "active")
    .order("pinned", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const all = (data as MemoryEntry[] | null) ?? [];
  if (all.length === 0) return [];

  if (all.length <= limit) {
    bumpUsage(all.map((m) => m.id));
    return all;
  }

  // Store has outgrown the prefix — rank.
  const sims = await semanticMatchIds(userText, limit);
  const byId = new Map(all.map((m) => [m.id, m]));
  const picked = new Map<string, PrefixMemory>();

  for (const m of all) {
    if (m.pinned) picked.set(m.id, { ...m, similarity: sims.get(m.id) });
  }
  // Semantic matches, highest similarity first.
  for (const [id, similarity] of [...sims.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    if (picked.size >= limit) break;
    const m = byId.get(id);
    if (m && !picked.has(id)) picked.set(id, { ...m, similarity });
  }
  // Recency backfill (the array is already recency-ordered).
  for (const m of all) {
    if (picked.size >= limit) break;
    if (!picked.has(m.id)) picked.set(m.id, { ...m });
  }

  const result = [...picked.values()];
  bumpUsage(result.map((m) => m.id));
  return result;
}

// Keyword + semantic search over active memories — backs the `search_memory`
// chat tool for facts that aren't in the always-injected prefix.
export async function searchMemoriesCore(
  query: string,
  limit = 10,
): Promise<PrefixMemory[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const q = query.trim();
  if (!q) return [];

  const sims = await semanticMatchIds(q, limit);
  const merged = new Map<string, PrefixMemory>();

  // Semantic hits first — fetch the rows for the matched ids.
  if (sims.size > 0) {
    const { data: semRows } = await supabase
      .from("memory_entries")
      .select(READ_COLUMNS)
      .eq("owner_id", getOwnerId())
      .in("id", [...sims.keys()]);
    for (const m of (semRows as MemoryEntry[] | null) ?? []) {
      merged.set(m.id, { ...m, similarity: sims.get(m.id) });
    }
  }

  // Keyword pass over key + value. Sanitize the term: commas and parens are
  // PostgREST `or`-filter syntax, '%' is a LIKE wildcard.
  const safe = q.replace(/[,()%]/g, " ").trim();
  if (safe) {
    const { data } = await supabase
      .from("memory_entries")
      .select(READ_COLUMNS)
      .eq("owner_id", getOwnerId())
      .eq("status", "active")
      .or(`key.ilike.%${safe}%,value.ilike.%${safe}%`)
      .limit(limit);
    for (const m of (data as MemoryEntry[] | null) ?? []) {
      if (!merged.has(m.id)) merged.set(m.id, m);
    }
  }

  return [...merged.values()]
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, limit);
}
