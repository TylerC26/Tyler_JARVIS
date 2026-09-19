import { getOwnerId } from "@/lib/auth/currentUser";
import {
  getProjectCore,
  listMilestonesCore,
  listProjectsCore,
} from "@/lib/db/core/projects";
import {
  projectProgress,
  type ProjectProgress,
} from "@/lib/db/queries/project-progress";
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
  // The one number every screen should render. task_pct / milestone_pct are
  // kept for callers that genuinely want a specific basis, but anything
  // displaying "how far along is this" must use `progress`.
  progress: ProjectProgress;
  next_milestone:
    | { id: string; title: string; target_date: string | null }
    | null;
};

// Raw per-basis ratio. Returns 0 for an empty denominator, which is why it
// must NOT be used to answer "how far along is this project" — a project with
// nothing tracked then renders identically to one with twenty open tasks and
// none done. Use `progress` (lib/db/queries/project-progress.ts) for that.
function pctOf(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

// Counts for every project in two queries, rather than three per project.
//
// The previous version fired open-count, done-count and milestone-select per
// project inside a Promise.all over projects — N*3 round-trips, with its own
// comment noting it should become a grouped query "if this ever scales". The
// weekly review is about to read these on every load, so it did.
async function loadCounts(projectIds: string[]): Promise<{
  tasks: Map<string, { open: number; done: number }>;
  milestones: Map<string, ProjectMilestone[]>;
}> {
  const tasks = new Map<string, { open: number; done: number }>();
  const milestones = new Map<string, ProjectMilestone[]>();
  if (projectIds.length === 0) return { tasks, milestones };

  const supabase = await getSupabaseServer();
  if (!supabase) return { tasks, milestones };
  const owner = getOwnerId();

  const [taskR, milestoneR] = await Promise.all([
    supabase
      .from("tasks")
      .select("project_id, status")
      .eq("owner_id", owner)
      .in("project_id", projectIds),
    supabase
      .from("project_milestones")
      .select("*")
      .eq("owner_id", owner)
      .in("project_id", projectIds)
      .order("position", { ascending: true }),
  ]);

  for (const row of (taskR.data as { project_id: string; status: string }[] | null) ?? []) {
    const bucket = tasks.get(row.project_id) ?? { open: 0, done: 0 };
    if (row.status === "done") bucket.done += 1;
    else bucket.open += 1;
    tasks.set(row.project_id, bucket);
  }

  for (const m of (milestoneR.data as ProjectMilestone[] | null) ?? []) {
    const list = milestones.get(m.project_id) ?? [];
    list.push(m);
    milestones.set(m.project_id, list);
  }

  return { tasks, milestones };
}

function buildSummary(
  project: Project,
  taskCounts: { open: number; done: number } | undefined,
  milestones: ProjectMilestone[],
): ProjectSummary {
  const open_task_count = taskCounts?.open ?? 0;
  const done_task_count = taskCounts?.done ?? 0;
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
    progress: projectProgress({
      milestone_done,
      milestone_total,
      done_task_count,
      open_task_count,
    }),
    next_milestone: nextOpen
      ? {
          id: nextOpen.id,
          title: nextOpen.title,
          target_date: nextOpen.target_date,
        }
      : null,
  };
}

async function decorate(project: Project): Promise<ProjectSummary> {
  const { tasks, milestones } = await loadCounts([project.id]);
  return buildSummary(project, tasks.get(project.id), milestones.get(project.id) ?? []);
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
  const { tasks, milestones } = await loadCounts(projects.map((p) => p.id));
  return projects.map((p) =>
    buildSummary(p, tasks.get(p.id), milestones.get(p.id) ?? []),
  );
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
