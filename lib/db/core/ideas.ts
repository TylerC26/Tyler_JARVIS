// Ideas: scratchpad of rough thoughts. Live with title + body + pinned;
// promotion writes a Task/Project and stamps the idea as archived + linked.

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Idea, Project, Task } from "@/lib/db/types";
import { createTaskCore } from "@/lib/db/core/tasks";
import { createProjectCore } from "@/lib/db/core/projects";

export type CreateIdeaInput = {
  title: string;
  body?: string;
  pinned?: boolean;
};

export type UpdateIdeaInput = Partial<
  Pick<Idea, "title" | "body" | "pinned">
>;

type CoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listIdeasCore(opts?: {
  includeArchived?: boolean;
}): Promise<Idea[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("ideas")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (!opts?.includeArchived) q = q.is("archived_at", null);
  const { data } = await q;
  return (data as Idea[] | null) ?? [];
}

export async function getIdeaCore(id: string): Promise<Idea | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("ideas")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .maybeSingle();
  return (data as Idea | null) ?? null;
}

export async function createIdeaCore(
  input: CreateIdeaInput,
): Promise<CoreResult<Idea>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const { data, error } = await supabase
    .from("ideas")
    .insert({
      owner_id: getOwnerId(),
      title,
      body: (input.body ?? "").trim(),
      pinned: input.pinned ?? false,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Idea };
}

export async function updateIdeaCore(
  id: string,
  patch: UpdateIdeaInput,
): Promise<CoreResult<Idea>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };

  const updates: Partial<Idea> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    updates.title = t;
  }
  if (patch.body !== undefined) updates.body = patch.body;
  if (patch.pinned !== undefined) updates.pinned = patch.pinned;

  const { data, error } = await supabase
    .from("ideas")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Idea };
}

export async function deleteIdeaCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("ideas")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Helper for the promote actions: stamp archived_at + the appropriate
// promoted_to_*_id, leaving the idea soft-archived but linkable.
async function archiveAsPromoted(
  id: string,
  link: { promoted_to_task_id?: string; promoted_to_project_id?: string },
): Promise<CoreResult<Idea>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { data, error } = await supabase
    .from("ideas")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...link,
    })
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Idea };
}

export async function promoteIdeaToTaskCore(
  id: string,
): Promise<CoreResult<{ idea: Idea; task: Task }>> {
  const idea = await getIdeaCore(id);
  if (!idea) return { ok: false, error: "Idea not found." };
  if (idea.archived_at) {
    return { ok: false, error: "Idea is already archived." };
  }

  const taskResult = await createTaskCore({
    title: idea.title,
    description: idea.body || null,
  });
  if (!taskResult.ok) return { ok: false, error: taskResult.error };

  const ideaResult = await archiveAsPromoted(id, {
    promoted_to_task_id: taskResult.data.id,
  });
  if (!ideaResult.ok) return { ok: false, error: ideaResult.error };

  return { ok: true, data: { idea: ideaResult.data, task: taskResult.data } };
}

export async function promoteIdeaToProjectCore(
  id: string,
): Promise<CoreResult<{ idea: Idea; project: Project }>> {
  const idea = await getIdeaCore(id);
  if (!idea) return { ok: false, error: "Idea not found." };
  if (idea.archived_at) {
    return { ok: false, error: "Idea is already archived." };
  }

  const projectResult = await createProjectCore({
    name: idea.title,
    description: idea.body || null,
  });
  if (!projectResult.ok) return { ok: false, error: projectResult.error };

  const ideaResult = await archiveAsPromoted(id, {
    promoted_to_project_id: projectResult.data.id,
  });
  if (!ideaResult.ok) return { ok: false, error: ideaResult.error };

  return {
    ok: true,
    data: { idea: ideaResult.data, project: projectResult.data },
  };
}
