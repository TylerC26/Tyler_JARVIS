// Server-side page awareness for the chatbox. The docked launcher sends the
// pathname the user is on with every turn; this resolves it into a
// "CURRENT PAGE" system-prompt block so the model treats ambiguous messages
// ("what's the status?", "summarize this") as being about what's on screen.
// Detail pages (project / meeting / repo task) get the actual record inlined;
// list pages get a one-liner. Best-effort throughout — a fetch failure must
// never sink the chat turn, so resolution degrades to null.

import { getMeetingCore } from "@/lib/db/core/meetings";
import { getRepoTaskCore } from "@/lib/db/core/repo-tasks";
import { listProjectMeetings } from "@/lib/db/queries/meetings";
import {
  getProjectSummary,
  listProjectMilestones,
} from "@/lib/db/queries/projects";
import { listProjectTasks } from "@/lib/db/queries/tasks";

export type PageContext = {
  // Short human label, also fed to the route classifier as a hint.
  label: string;
  // Full block injected into the system context prefix (no leading newlines).
  block: string;
};

const MAX_OPEN_TASKS = 8;
const MAX_MILESTONES = 8;
const MAX_MEETINGS = 5;

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "no date";
}

// One-liners for the list/static pages. The wording tells the model what data
// lives there so it picks the right tools without a lookup.
const STATIC_PAGES: Record<string, { label: string; desc: string }> = {
  "/": {
    label: "the dashboard",
    desc: "the HUD overview — today's events, open tasks, agent ops board, project tiles",
  },
  "/assistant": {
    label: "the assistant brief page",
    desc: "his generated daily brief",
  },
  "/agents": {
    label: "the agents page",
    desc: "the sub-agent roster — names, prompts, tools, models",
  },
  "/calendar": {
    label: "the calendar page",
    desc: "his calendar — events, wife's shift roster, WFH status badges",
  },
  "/cron": {
    label: "the cron jobs page",
    desc: "scheduled recurring jobs and their run history",
  },
  "/grocery": {
    label: "the grocery list page",
    desc: "his grocery/shopping list",
  },
  "/ideas": { label: "the ideas page", desc: "captured fleeting ideas" },
  "/kcal": {
    label: "the kcal tracker page",
    desc: "his calorie/meal tracking log",
  },
  "/meetings": {
    label: "the meetings page",
    desc: "recorded meetings — transcripts, summaries, linked notes",
  },
  "/memory": {
    label: "the memory page",
    desc: "his long-term memory entries (facts Jarvis remembers)",
  },
  "/notes": {
    label: "the notes page",
    desc: "free-form saved notes grouped by category",
  },
  "/office": {
    label: "the agent office page",
    desc: "the live orchestrator → agent delegation radar; he usually delegates tasks from here",
  },
  "/places": {
    label: "the places page",
    desc: "saved places / venues to visit",
  },
  "/projects": {
    label: "the projects page",
    desc: "his side-business projects — status, milestones, task progress",
  },
  "/repo-tasks": {
    label: "the repo tasks page",
    desc: "dispatched coding tasks the Mac daemon runs against his git repos",
  },
  "/settings": {
    label: "the settings page",
    desc: "app settings and prompt customization",
  },
  "/skills": {
    label: "the skills page",
    desc: "saved chat skills (reusable instruction packs)",
  },
  "/tasks": { label: "the tasks page", desc: "his full to-do list" },
  "/tools": { label: "the tools page", desc: "misc utility tools" },
  "/ventures": {
    label: "the ventures page",
    desc: "his business ventures overview",
  },
};

// Shared instruction stitched onto every block.
function assumeLine(subject: string): string {
  return `When his message is ambiguous or uses deictic words ("this", "it", "here", "the status"), assume it refers to ${subject} — don't ask which one he means.`;
}

async function projectBlock(slug: string): Promise<PageContext | null> {
  const project = await getProjectSummary(slug);
  if (!project) return null;
  const [milestones, tasks, meetings] = await Promise.all([
    listProjectMilestones(project.id),
    listProjectTasks(project.id),
    listProjectMeetings(project.id),
  ]);

  const lines: string[] = [
    `CURRENT PAGE — Tyler has the project "${project.name}" (slug: ${project.slug}) open.`,
    assumeLine(`the ${project.name} project`),
    `Snapshot (already loaded — don't re-query for these):`,
    `• status: ${project.status} · category: ${project.category}` +
      (project.target_date ? ` · target: ${project.target_date}` : ""),
  ];
  if (project.description) lines.push(`• about: ${clip(project.description, 300)}`);
  if (project.github_repo_url)
    lines.push(
      `• repo: ${project.github_repo_url}` +
        (project.github_default_branch ? ` (${project.github_default_branch})` : ""),
    );
  lines.push(
    `• progress: tasks ${project.done_task_count}/${project.done_task_count + project.open_task_count} done (${project.task_pct}%) · milestones ${project.milestone_done}/${project.milestone_total} (${project.milestone_pct}%)`,
  );
  if (project.next_milestone)
    lines.push(
      `• next milestone: ${project.next_milestone.title} (target ${day(project.next_milestone.target_date)})`,
    );

  const openTasks = tasks.filter((t) => t.status !== "done");
  if (openTasks.length > 0) {
    const shown = openTasks.slice(0, MAX_OPEN_TASKS);
    lines.push(`• open tasks (${openTasks.length}):`);
    for (const t of shown)
      lines.push(
        `    - ${t.title}${t.due_at ? ` (due ${day(t.due_at)})` : ""}${t.important ? " ⚑" : ""}  (id=${t.id})`,
      );
    if (openTasks.length > shown.length)
      lines.push(`    … +${openTasks.length - shown.length} more`);
  }

  if (milestones.length > 0) {
    const shown = milestones.slice(0, MAX_MILESTONES);
    lines.push(`• milestones:`);
    for (const m of shown)
      lines.push(
        `    ${m.completed_at ? "✓" : "○"} ${m.title}${m.target_date ? ` (target ${m.target_date})` : ""}`,
      );
    if (milestones.length > shown.length)
      lines.push(`    … +${milestones.length - shown.length} more`);
  }

  if (meetings.length > 0) {
    const shown = meetings.slice(0, MAX_MEETINGS);
    lines.push(`• attached meetings (newest first):`);
    for (const m of shown) {
      lines.push(
        `    - ${m.title || "untitled"} (${day(m.started_at)}, ${m.status})`,
      );
      // Inline the note so "what came out of the last meeting?" needs no
      // lookup; flatten whitespace to keep the block one line per meeting.
      if (m.summary)
        lines.push(`      notes: ${clip(m.summary.replace(/\s+/g, " "), 400)}`);
    }
    if (meetings.length > shown.length)
      lines.push(
        `    … +${meetings.length - shown.length} more (query_state domain "meetings" with project="${slug}" for all of them)`,
      );
  }

  if (project.notes) lines.push(`• project notes: ${clip(project.notes, 500)}`);

  return { label: `the ${project.name} project page`, block: lines.join("\n") };
}

async function meetingBlock(id: string): Promise<PageContext | null> {
  const meeting = await getMeetingCore(id);
  if (!meeting) return null;
  const mins = meeting.duration_ms
    ? `${Math.round(meeting.duration_ms / 60000)} min`
    : null;
  const lines: string[] = [
    `CURRENT PAGE — Tyler has the meeting "${meeting.title}" open (${day(meeting.started_at)}${mins ? `, ${mins}` : ""}, status: ${meeting.status}).`,
    assumeLine("this meeting"),
  ];
  if (meeting.summary) lines.push(`Meeting summary:\n${clip(meeting.summary, 1500)}`);
  else if (meeting.status !== "done")
    lines.push(`No summary yet — the recording is still ${meeting.status}.`);
  return { label: `the "${meeting.title}" meeting page`, block: lines.join("\n") };
}

async function repoTaskBlock(id: string): Promise<PageContext | null> {
  const task = await getRepoTaskCore(id);
  if (!task) return null;
  const lines: string[] = [
    `CURRENT PAGE — Tyler has a repo task open: "${clip(task.instruction, 200)}" on ${task.repo_path} (status: ${task.status}${task.branch ? `, branch ${task.branch}` : ""}).`,
    assumeLine("this repo task"),
  ];
  if (task.result) lines.push(`Result: ${clip(task.result, 600)}`);
  if (task.error) lines.push(`Error: ${clip(task.error, 400)}`);
  if (task.diff_summary)
    lines.push(
      `Diff: ${clip(task.diff_summary, 400)}${task.diff_files_changed ? ` (${task.diff_files_changed} files)` : ""}`,
    );
  return { label: "a repo task page", block: lines.join("\n") };
}

// Resolve the pathname the chat turn was sent from into a context block.
// Unknown routes and the dedicated chat surfaces return null (no block).
export async function resolvePageContext(
  path: string | null | undefined,
): Promise<PageContext | null> {
  if (!path) return null;
  try {
    const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
    const seg = clean.split("/").filter(Boolean).map(decodeURIComponent);

    if (seg[0] === "projects" && seg[1]) return await projectBlock(seg[1]);
    if (seg[0] === "meetings" && seg[1]) return await meetingBlock(seg[1]);
    if (seg[0] === "repo-tasks" && seg[1]) return await repoTaskBlock(seg[1]);

    const page = STATIC_PAGES[clean];
    if (!page) return null;
    return {
      label: page.label,
      block: `CURRENT PAGE — Tyler is on ${page.label} (${clean}): ${page.desc}.\n${assumeLine("what's on this page")}`,
    };
  } catch (e) {
    console.warn("[chat] page context resolution failed:", e);
    return null;
  }
}
