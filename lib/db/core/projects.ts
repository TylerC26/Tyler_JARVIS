import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  Project,
  ProjectCategory,
  ProjectLink,
  ProjectMilestone,
  ProjectStatus,
} from "@/lib/db/types";
import type { CoreResult } from "./tasks";

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  category?: ProjectCategory;
  phase?: string | null;
  tags?: string[];
  color?: string | null;
  started_at?: string | null;
  target_date?: string | null;
  notes?: string | null;
  github_repo_url?: string | null;
  github_default_branch?: string | null;
  links?: ProjectLink[];
};

export type UpdateProjectInput = Partial<
  Pick<
    Project,
    | "name"
    | "description"
    | "status"
    | "category"
    | "phase"
    | "tags"
    | "color"
    | "started_at"
    | "target_date"
    | "notes"
    | "github_repo_url"
    | "github_default_branch"
    | "links"
  >
>;

// Drop empty rows and trim — keeps stray blank link rows from the edit form out
// of the DB. A link is only meaningful with a URL.
function cleanLinks(links: ProjectLink[]): ProjectLink[] {
  return links
    .map((l) => ({
      platform: (l.platform || "custom").trim(),
      label: (l.label || "").trim(),
      url: (l.url || "").trim(),
    }))
    .filter((l) => l.url.length > 0);
}

// Trim, drop blanks, and de-dupe (case-preserving, first-wins) so the tag chips
// stay tidy regardless of how the edit form serialized them.
function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = (raw || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export type CreateMilestoneInput = {
  project_id: string;
  title: string;
  description?: string | null;
  target_date?: string | null;
  position?: number;
};

export type UpdateMilestoneInput = Partial<
  Pick<
    ProjectMilestone,
    "title" | "description" | "target_date" | "position" | "completed_at"
  >
>;

// Project name → URL-safe slug. Strips diacritics, collapses whitespace and
// punctuation to single dashes, lower-cases, trims to a sensible length.
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Find the next available slug for this owner: foo, foo-2, foo-3, ...
async function uniqueSlug(base: string): Promise<string> {
  const supabase = await getSupabaseServer();
  if (!supabase) return base;

  const owner = getOwnerId();
  const { data } = await supabase
    .from("projects")
    .select("slug")
    .eq("owner_id", owner)
    .like("slug", `${base}%`);

  const taken = new Set(((data as { slug: string }[] | null) ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function listProjectsCore(
  opts: {
    status?: ProjectStatus | "all";
    category?: ProjectCategory | "all";
  } = {},
): Promise<Project[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  let q = supabase
    .from("projects")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.category && opts.category !== "all")
    q = q.eq("category", opts.category);
  const { data } = await q;
  return (data as Project[] | null) ?? [];
}

export async function getProjectCore(idOrSlug: string): Promise<Project | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const owner = getOwnerId();
  // Try id first (uuid lookup is cheap and unambiguous), then fall back to slug.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  if (looksLikeUuid) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("owner_id", owner)
      .eq("id", idOrSlug)
      .maybeSingle();
    if (data) return data as Project;
  }
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", owner)
    .eq("slug", idOrSlug)
    .maybeSingle();
  return (data as Project | null) ?? null;
}

// Fuzzy project resolver for chat tools — accepts an id, a slug, or a (case-
// insensitive) name match. Returns the first hit.
export async function findProjectCore(needle: string): Promise<Project | null> {
  const direct = await getProjectCore(needle);
  if (direct) return direct;
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", getOwnerId())
    .ilike("name", needle)
    .maybeSingle();
  if (data) return data as Project;
  // Last-resort substring match.
  const { data: fuzzy } = await supabase
    .from("projects")
    .select("*")
    .eq("owner_id", getOwnerId())
    .ilike("name", `%${needle}%`)
    .limit(1);
  const first = (fuzzy as Project[] | null)?.[0];
  return first ?? null;
}

export async function createProjectCore(
  input: CreateProjectInput,
): Promise<CoreResult<Project>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Project name is required." };

  const baseSlug = slugify(name) || "project";
  const slug = await uniqueSlug(baseSlug);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: getOwnerId(),
      name,
      slug,
      description: input.description ?? null,
      status: input.status ?? "active",
      category: input.category ?? "other",
      phase: input.phase ?? null,
      tags: input.tags ? cleanTags(input.tags) : [],
      color: input.color ?? null,
      started_at: input.started_at ?? null,
      target_date: input.target_date ?? null,
      notes: input.notes ?? null,
      github_repo_url: input.github_repo_url ?? null,
      github_default_branch: input.github_default_branch ?? null,
      links: input.links ? cleanLinks(input.links) : [],
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Project };
}

export async function updateProjectCore(
  id: string,
  patch: UpdateProjectInput,
): Promise<CoreResult<Project>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Project id is required." };

  const updates: Partial<Project> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) return { ok: false, error: "Name cannot be empty." };
    updates.name = n;
  }
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.phase !== undefined) updates.phase = patch.phase;
  if (patch.tags !== undefined) updates.tags = cleanTags(patch.tags);
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.started_at !== undefined) updates.started_at = patch.started_at;
  if (patch.target_date !== undefined) updates.target_date = patch.target_date;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.github_repo_url !== undefined)
    updates.github_repo_url = patch.github_repo_url;
  if (patch.github_default_branch !== undefined)
    updates.github_default_branch = patch.github_default_branch;
  if (patch.links !== undefined) updates.links = cleanLinks(patch.links);

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as Project };
}

export async function deleteProjectCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Project id is required." };

  // Milestones cascade-delete via FK; tasks fall back to project_id=null via FK
  // on delete set null — both are handled at the schema layer.
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ---------- milestones ----------

export async function listMilestonesCore(
  projectId: string,
): Promise<ProjectMilestone[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const { data } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as ProjectMilestone[] | null) ?? [];
}

export async function createMilestoneCore(
  input: CreateMilestoneInput,
): Promise<CoreResult<ProjectMilestone>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Milestone title is required." };
  if (!input.project_id)
    return { ok: false, error: "project_id is required." };

  // Default position = end of the list so new milestones append.
  let position = input.position;
  if (position === undefined) {
    const { count } = await supabase
      .from("project_milestones")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", getOwnerId())
      .eq("project_id", input.project_id);
    position = count ?? 0;
  }

  const { data, error } = await supabase
    .from("project_milestones")
    .insert({
      owner_id: getOwnerId(),
      project_id: input.project_id,
      title,
      description: input.description ?? null,
      target_date: input.target_date ?? null,
      position,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ProjectMilestone };
}

export async function updateMilestoneCore(
  id: string,
  patch: UpdateMilestoneInput,
): Promise<CoreResult<ProjectMilestone>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Milestone id is required." };

  const updates: Partial<ProjectMilestone> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title cannot be empty." };
    updates.title = t;
  }
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.target_date !== undefined) updates.target_date = patch.target_date;
  if (patch.position !== undefined) updates.position = patch.position;
  if (patch.completed_at !== undefined) updates.completed_at = patch.completed_at;

  const { data, error } = await supabase
    .from("project_milestones")
    .update(updates)
    .eq("owner_id", getOwnerId())
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ProjectMilestone };
}

export async function setMilestoneCompletedCore(
  id: string,
  completed: boolean,
): Promise<CoreResult<ProjectMilestone>> {
  return updateMilestoneCore(id, {
    completed_at: completed ? new Date().toISOString() : null,
  });
}

export async function deleteMilestoneCore(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  if (!id) return { ok: false, error: "Milestone id is required." };
  const { error } = await supabase
    .from("project_milestones")
    .delete()
    .eq("owner_id", getOwnerId())
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// Fuzzy milestone resolver — used by the chat tool that completes a milestone
// by title. Substring match scoped to the project, case-insensitive.
export async function findMilestoneCore(
  projectId: string,
  titleNeedle: string,
): Promise<ProjectMilestone | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("project_milestones")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("project_id", projectId)
    .ilike("title", `%${titleNeedle}%`)
    .order("position", { ascending: true })
    .limit(1);
  const first = (data as ProjectMilestone[] | null)?.[0];
  return first ?? null;
}
