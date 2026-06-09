import { getOwnerId } from "@/lib/auth/currentUser";
import {
  getProjectCore,
  listMilestonesCore,
  listProjectsCore,
} from "@/lib/db/core/projects";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  Project,
  ProjectCategory,
  ProjectMilestone,
  ProjectStatus,
} from "@/lib/db/types";

export type ProjectSummary = Project & {
  open_task_count: number;
  done_task_count: number;
  task_pct: number;
  milestone_total: number;
  milestone_done: number;
  milestone_pct: number;
  next_milestone:
    | { id: string; title: string; target_date: string | null }
    | null;
};

function pctOf(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

// One round-trip per project for the counts is fine — Tyler will have a
// handful of side hustles, not hundreds. If this ever scales, swap for a
// single grouped-count RPC.
async function decorate(project: Project): Promise<ProjectSummary> {
  const supabase = await getSupabaseServer();
  const owner = getOwnerId();

  let open_task_count = 0;
  let done_task_count = 0;
  let milestones: ProjectMilestone[] = [];

  if (supabase) {
    const [openR, doneR, milestoneR] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", owner)
        .eq("project_id", project.id)
        .neq("status", "done"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", owner)
        .eq("project_id", project.id)
        .eq("status", "done"),
      supabase
        .from("project_milestones")
        .select("*")
        .eq("owner_id", owner)
        .eq("project_id", project.id)
        .order("position", { ascending: true }),
    ]);
    open_task_count = openR.count ?? 0;
    done_task_count = doneR.count ?? 0;
    milestones = (milestoneR.data as ProjectMilestone[] | null) ?? [];
  }

  const totalTasks = open_task_count + done_task_count;
  const milestone_total = milestones.length;
  const milestone_done = milestones.filter((m) => m.completed_at).length;
  const nextOpen = milestones.find((m) => !m.completed_at);

  return {
    ...project,
    open_task_count,
    done_task_count,
    task_pct: pctOf(done_task_count, totalTasks),
    milestone_total,
    milestone_done,
    milestone_pct: pctOf(milestone_done, milestone_total),
    next_milestone: nextOpen
      ? {
          id: nextOpen.id,
          title: nextOpen.title,
          target_date: nextOpen.target_date,
        }
      : null,
  };
}

export async function listProjectSummaries(
  opts: {
    status?: ProjectStatus | "all";
    category?: ProjectCategory | "all";
  } = {},
): Promise<ProjectSummary[]> {
  const projects = await listProjectsCore({
    status: opts.status,
    category: opts.category,
  });
  return Promise.all(projects.map(decorate));
}

export async function getProjectSummary(
  idOrSlug: string,
): Promise<ProjectSummary | null> {
  const project = await getProjectCore(idOrSlug);
  if (!project) return null;
  return decorate(project);
}

export async function listProjectMilestones(
  projectId: string,
): Promise<ProjectMilestone[]> {
  return listMilestonesCore(projectId);
}
