// Notes: free-form body-dump text from chat or the /notes page. Grouped by
// an auto-picked category. Pure data — promotion to task/project is not
// supported (use `ideas` for that flow).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Note } from "@/lib/db/types";

export type CreateNoteInput = {
  title?: string;
  body: string;
  category?: string;
  pinned?: boolean;
  project_id?: string | null;
};

export type UpdateNoteInput = Partial<
  Pick<Note, "title" | "body" | "category" | "pinned" | "project_id">
>;

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

function normalizeCategory(c: string | undefined | null): string {
  const v = (c ?? "").trim().toLowerCase();
  if (!v) return "general";
  // Slug-ish: collapse runs of non-alphanumeric to single dash, trim dashes.
  return v.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general";
}

export async function listNotesCore(opts?: {
  category?: string;
  project_id?: string;
}): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts?.category) q = q.eq("category", normalizeCategory(opts.category));
  if (opts?.project_id) q = q.eq("project_id", opts.project_id);
  const { data } = await q;
  return (data as Note[] | null) ?? [];
}

export async function getNoteCore(id: string): Promise<Note | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Note | null) ?? null;
}

export async function createNoteCore(
  input: CreateNoteInput,
): Promise<CoreResult<Note>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Body is required." };

  const { data, error } = await supabase
    .from("notes")
    .insert({
      owner_id: getOwnerId(),
      title: (input.title ?? "").trim(),
      body,
      category: normalizeCategory(input.category),
      pinned: input.pinned ?? false,
      project_id: input.project_id ?? null,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Note };
}

export async function updateNoteCore(
  id: string,
  patch: UpdateNoteInput,
): Promise<CoreResult<Note>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Note> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.body !== undefined) {
    const b = patch.body.trim();
    if (!b) return { ok: false, error: "Body cannot be empty." };
    updates.body = b;
  }
  if (patch.category !== undefined) {
    updates.category = normalizeCategory(patch.category);
  }
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;
  if (patch.project_id !== undefined) updates.project_id = patch.project_id;

  const { data, error } = await supabase
    .from("notes")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Note };
}

export async function deleteNoteCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Distinct categories with counts. Used by the page header chip row and
// by the read_notes tool so the brain can ask for the catalog cheaply.
export async function listNoteCategoriesCore(): Promise<
  { category: string; count: number }[]
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("category")
    .eq("owner_id", getOwnerId());
  const counts = new Map<string, number>();
  for (const row of (data as { category: string }[] | null) ?? []) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

// Keyword search over title + body. Postgres ILIKE is plenty for the volumes
// we expect here (the chat brain calls this on demand, not in a hot path).
export async function searchNotesCore(
  query: string,
  opts?: { limit?: number; category?: string },
): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const q = query.trim();
  if (!q) return [];
  let req = supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 20);
  if (opts?.category) {
    req = req.eq("category", normalizeCategory(opts.category));
  }
  const { data } = await req;
  return (data as Note[] | null) ?? [];
}

// Notes linked to a project — the // notes section on the project detail page.
export async function listNotesByProjectCore(
  projectId: string,
): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data as Note[] | null) ?? [];
}

// Recent notes not yet attached to any project — the candidate pool for the
// "attach note" picker on a project page. Capped: a shortlist, not an archive.
export async function listAttachableNotesCore(limit = 25): Promise<Note[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", getOwnerId())
    .is("project_id", null)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Note[] | null) ?? [];
}

// Attach (projectId) or detach (null) a note. Owner-scoped so a stray id can't
// reassign someone else's note.
export async function setNoteProjectCore(
  noteId: string,
  projectId: string | null,
): Promise<CoreResult<Note>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!noteId) return { ok: false, error: "Note id is required." };

  const { data, error } = await supabase
    .from("notes")
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq("owner_id", getOwnerId())
    .eq("id", noteId)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Note };
}
