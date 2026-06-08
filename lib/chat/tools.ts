import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { runBrief } from "@/lib/ai/run";
import { fmtDate } from "@/lib/date";
import { getAgentBySlug } from "@/lib/db/queries/agents";
import { createIdeaCore } from "@/lib/db/core/ideas";
import {
  archiveMemoryCore,
  createMemoryCore,
  searchMemoriesCore,
  updateMemoryCore,
} from "@/lib/db/core/memory";
import {
  GROCERY_CATEGORIES,
  MEMORY_KINDS,
  PLACE_CATEGORIES,
} from "@/lib/db/types";
import {
  createPlaceCore,
  listPlacesCore,
  searchPlacesCore,
  updatePlaceStatusCore,
} from "@/lib/db/core/places";
import {
  addGroceryItemsCore,
  clearCheckedGroceryItemsCore,
  deleteGroceryItemCore,
  findGroceryItemsByNameCore,
  listGroceryItemsCore,
  setGroceryItemCheckedCore,
} from "@/lib/db/core/grocery";
import { createMealCore, listMealsCore } from "@/lib/db/core/meals";
import { getMealPhotoContext } from "@/lib/chat/request-context";
import { detectPostUrl, fetchPost } from "@/lib/places/fetch-post";
import { extractPlace } from "@/lib/places/extract";
import {
  createNoteCore,
  listNoteCategoriesCore,
  listNotesCore,
  searchNotesCore,
  updateNoteCore,
} from "@/lib/db/core/notes";
import {
  getPromptSettingsCore,
  upsertPromptSettingsCore,
} from "@/lib/db/core/prompt-settings";
import {
  DEFAULT_EVENING_BRIEF_PROMPT,
  DEFAULT_MORNING_BRIEF_PROMPT,
} from "@/lib/ai/engine/claude";
import {
  createEventCore,
  deleteEventCore,
  listEventsInRangeCore,
  listUpcomingEventsCore,
  moveEventCore,
  updateEventCore,
} from "@/lib/db/core/events";
import {
  createTaskCore,
  deleteTaskCore,
  setTaskStatusCore,
} from "@/lib/db/core/tasks";
import {
  createMilestoneCore,
  createProjectCore,
  findMilestoneCore,
  findProjectCore,
  setMilestoneCompletedCore,
  updateProjectCore,
} from "@/lib/db/core/projects";
import {
  fetchRecentCommits,
  fetchRepoFile,
  fetchRepoMetadata,
  fetchRepoReadme,
  fetchRepoTree,
  parseRepoUrl,
} from "@/lib/github/client";
import { createSkillCore } from "@/lib/db/core/skills";
import { searchChatMessagesCore } from "@/lib/db/core/chat-search";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import {
  deleteWfhStatusInRangeCore,
  listWfhStatusInRangeCore,
  upsertWfhStatusCore,
  type WfhStatusInput,
} from "@/lib/db/core/wfh-status";
import { listProjectSummaries } from "@/lib/db/queries/projects";
import { listActiveSkills } from "@/lib/db/queries/skills";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import { listUpcomingWfhStatus } from "@/lib/db/queries/wfh-status";
import { webSearch } from "@/lib/web-search/anthropic";

// ---------- task tools ----------

export const addTaskTool = tool({
  description:
    "Create a new task in the user's todo. Use for any 'add task', 'remind me to', 'todo', 'I need to' style request. Pass the project arg when the task belongs to one of the side-business projects listed in the context prefix.",
  inputSchema: z.object({
    title: z.string().describe("Short imperative title of the task."),
    description: z.string().optional(),
    status: z.enum(["todo", "done"]).optional(),
    priority: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("1=critical, 2=high, 3=normal (default), 4=low"),
    due_at: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp. Resolve relative dates ('tomorrow', 'Friday') against the current date in context.",
      ),
    project: z
      .string()
      .optional()
      .describe(
        "Optional project name or slug (e.g. 'Lemon Lab'). When provided, the task is tagged to that project. Use this whenever the user mentions one of the side-business projects from the context prefix.",
      ),
  }),
  execute: async (input) => {
    let project_id: string | null = null;
    let projectLabel = "";
    if (input.project && input.project.trim()) {
      const project = await findProjectCore(input.project.trim());
      if (!project)
        return {
          ok: false,
          error: `No project matches "${input.project}". Create the project first via add_project, or omit the project arg.`,
        };
      project_id = project.id;
      projectLabel = ` · ${project.name}`;
    }
    const result = await createTaskCore({
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? 3,
      due_at: input.due_at ?? null,
      project_id,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Task added: "${result.data.title}"${projectLabel}`,
      task: result.data,
    };
  },
});

export const completeTaskTool = tool({
  description: "Mark a task as done by id.",
  inputSchema: z.object({ task_id: z.string() }),
  execute: async ({ task_id }) => {
    const result = await setTaskStatusCore(task_id, "done");
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: `Marked done: "${result.data.title}"` };
  },
});

export const deleteTaskTool = tool({
  description: "Delete a task by id.",
  inputSchema: z.object({ task_id: z.string() }),
  execute: async ({ task_id }) => {
    const result = await deleteTaskCore(task_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Task deleted." };
  },
});

// ---------- calendar tools ----------

export const addCalendarEventTool = tool({
  description:
    "Add a calendar event. Use all_day=true for trips, conferences, vacations, or anything spanning whole days — set ends_at to the last day of the trip and the system will snap to clean day boundaries automatically.",
  inputSchema: z.object({
    title: z.string(),
    starts_at: z
      .string()
      .describe(
        "ISO 8601 start timestamp WITH the user's local offset (e.g. 2026-05-12T19:00:00+08:00). Never use trailing Z. Resolve relative phrases ('tomorrow 7pm') against the Current local time in the context prefix.",
      ),
    ends_at: z
      .string()
      .optional()
      .describe(
        "ISO 8601 end with the same local offset as starts_at. Defaults to 1 hour after starts_at.",
      ),
    all_day: z.boolean().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    category: z
      .enum(["work", "personal", "health", "social", "travel", "other"])
      .optional()
      .describe("Color-grouping category. Pick the closest match."),
  }),
  execute: async (input) => {
    const result = await createEventCore({
      title: input.title,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      all_day: input.all_day ?? false,
      location: input.location ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Event added: ${result.data.title} on ${fmtDate(result.data.starts_at)}`,
      event: result.data,
    };
  },
});

export const updateEventTool = tool({
  description:
    "Update an existing calendar event by id. Pass only the fields that should change.",
  inputSchema: z.object({
    event_id: z.string(),
    title: z.string().optional(),
    starts_at: z
      .string()
      .optional()
      .describe("ISO 8601 with the user's local offset. Never trailing Z."),
    ends_at: z
      .string()
      .optional()
      .describe("ISO 8601 with the same local offset as starts_at."),
    all_day: z.boolean().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    category: z
      .enum(["work", "personal", "health", "social", "travel", "other"])
      .optional(),
  }),
  execute: async ({ event_id, ...patch }) => {
    const result = await updateEventCore(event_id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Event updated: ${result.data.title}`,
      event: result.data,
    };
  },
});

export const moveEventTool = tool({
  description:
    "Reschedule an event. Preserves duration unless new_ends_at is provided.",
  inputSchema: z.object({
    event_id: z.string(),
    new_starts_at: z
      .string()
      .describe(
        "ISO 8601 with the user's local offset (e.g. 2026-05-12T19:00:00+08:00). Never trailing Z.",
      ),
    new_ends_at: z
      .string()
      .optional()
      .describe("ISO 8601 with the same local offset as new_starts_at."),
  }),
  execute: async ({ event_id, new_starts_at, new_ends_at }) => {
    const result = await moveEventCore(event_id, new_starts_at, new_ends_at);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Event moved: ${result.data.title} → ${fmtDate(result.data.starts_at)}`,
      event: result.data,
    };
  },
});

export const deleteEventTool = tool({
  description: "Delete a calendar event by id.",
  inputSchema: z.object({ event_id: z.string() }),
  execute: async ({ event_id }) => {
    const result = await deleteEventCore(event_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Event deleted." };
  },
});

export const listEventsInRangeTool = tool({
  description:
    "List events between two ISO timestamps. Use this to answer 'what's on Friday', 'what's tomorrow', 'when do I have free time', etc.",
  inputSchema: z.object({
    start: z.string().describe("ISO 8601 inclusive start"),
    end: z.string().describe("ISO 8601 exclusive end"),
  }),
  execute: async ({ start, end }) => {
    const events = await listEventsInRangeCore(start, end);
    return {
      ok: true,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        location: e.location,
        category: e.category,
        all_day: e.all_day,
      })),
    };
  },
});

// ---------- wife shifts ----------

export const listWifeShiftsTool = tool({
  description:
    "List the user's wife's nurse shifts between two dates (inclusive). Codes: A=AM 07:00–15:00 (7am–3pm), P=PM 14:30–22:30 (2:30pm–10:30pm), P1=PM-1 14:00–22:00 (2pm–10pm), Anight=AM+Night split (07:00–14:00 then 22:00 overnight), NO=Night 22:00 prev day–07:00 (10pm–7am), DO=Day Off. The next 21 days of shifts are already in your context prefix — use this tool ONLY for dates beyond that window or when the user asks for a specific date range you don't have.",
  inputSchema: z.object({
    from: z.string().describe("Inclusive start date in YYYY-MM-DD."),
    to: z.string().describe("Inclusive end date in YYYY-MM-DD."),
  }),
  execute: async ({ from, to }) => {
    const shifts = await listWifeShiftsInRangeCore(from, to);
    return {
      ok: true,
      count: shifts.length,
      shifts: shifts.map((s) => ({
        shift_date: s.shift_date,
        code: s.code,
      })),
    };
  },
});

// ---------- WFH status ----------

const WFH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WFH_MAX_DAYS = 60;

// Expand an inclusive from..to date range into an array of YYYY-MM-DD strings.
// Uses noon-UTC anchors so day stepping is immune to DST. Returns an error
// string if the inputs are malformed or the span exceeds WFH_MAX_DAYS.
function expandWfhRange(
  from: string,
  to: string,
): { ok: true; dates: string[] } | { ok: false; error: string } {
  if (!WFH_DATE_RE.test(from) || !WFH_DATE_RE.test(to)) {
    return { ok: false, error: "Dates must be in YYYY-MM-DD format." };
  }
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (end < start) {
    return { ok: false, error: "`to` must be on or after `from`." };
  }
  const dates: string[] = [];
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > WFH_MAX_DAYS) {
      return {
        ok: false,
        error: `Range too large (max ${WFH_MAX_DAYS} days). Narrow the from/to span.`,
      };
    }
  }
  return { ok: true, dates };
}

const WFH_LABELS: Record<string, string> = {
  wfh: "Working from home",
  office: "In the office",
  pto: "PTO / leave",
  out: "Out of office",
};

export const setWfhStatusTool = tool({
  description:
    "Set Tyler's work-location (WFH) status for a single day or a date range — shown as a per-day badge on the calendar. Use when he says things like 'I'm working from home tomorrow', 'set me to office Monday', 'I'm WFH Mon–Wed', 'I'm on PTO next Friday', 'I'll be out Thursday'. Status values: wfh = working from home, office = in the office, pto = paid time off / leave, out = out of office (travelling / offsite / away). Resolve relative dates ('tomorrow', 'Monday', 'next week') to YYYY-MM-DD against the Current local date in the context prefix. For a single day, pass only `from`. For non-contiguous days, call this tool once per block.",
  inputSchema: z.object({
    status: z
      .enum(["wfh", "office", "pto", "out"])
      .describe("wfh / office / pto / out."),
    from: z
      .string()
      .describe("Inclusive start date in YYYY-MM-DD."),
    to: z
      .string()
      .optional()
      .describe("Inclusive end date in YYYY-MM-DD. Defaults to `from` (single day)."),
    note: z
      .string()
      .optional()
      .describe("Optional short note (e.g. 'team offsite')."),
  }),
  execute: async ({ status, from, to, note }) => {
    const range = expandWfhRange(from, to ?? from);
    if (!range.ok) return { ok: false, error: range.error };
    const entries: WfhStatusInput[] = range.dates.map((status_date) => ({
      status_date,
      status,
      note: note ?? null,
    }));
    const result = await upsertWfhStatusCore(entries);
    if (!result.ok) return { ok: false, error: result.error };
    const span =
      range.dates.length === 1
        ? range.dates[0]
        : `${range.dates[0]} → ${range.dates[range.dates.length - 1]} (${range.dates.length} days)`;
    return {
      ok: true,
      message: `WFH status set: ${WFH_LABELS[status]} · ${span}`,
      count: result.data.length,
    };
  },
});

export const clearWfhStatusTool = tool({
  description:
    "Remove Tyler's WFH status for a single day or date range (clears the calendar badge). Use when he says 'clear my WFH status for Friday', 'remove my work location next week', or corrects a day he set by mistake.",
  inputSchema: z.object({
    from: z.string().describe("Inclusive start date in YYYY-MM-DD."),
    to: z
      .string()
      .optional()
      .describe("Inclusive end date in YYYY-MM-DD. Defaults to `from` (single day)."),
  }),
  execute: async ({ from, to }) => {
    const range = expandWfhRange(from, to ?? from);
    if (!range.ok) return { ok: false, error: range.error };
    const result = await deleteWfhStatusInRangeCore(
      range.dates[0],
      range.dates[range.dates.length - 1],
    );
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Cleared WFH status on ${result.data} day${result.data === 1 ? "" : "s"}.`,
      count: result.data,
    };
  },
});

export const listWfhStatusTool = tool({
  description:
    "List Tyler's WFH (work-location) statuses between two dates (inclusive). Values: wfh / office / pto / out. The next 21 days are already in your context prefix — use this tool ONLY for dates beyond that window or a specific range you don't already have.",
  inputSchema: z.object({
    from: z.string().describe("Inclusive start date in YYYY-MM-DD."),
    to: z.string().describe("Inclusive end date in YYYY-MM-DD."),
  }),
  execute: async ({ from, to }) => {
    const rows = await listWfhStatusInRangeCore(from, to);
    return {
      ok: true,
      count: rows.length,
      statuses: rows.map((r) => ({
        status_date: r.status_date,
        status: r.status,
      })),
    };
  },
});

// ---------- project tools ----------

export const addProjectTool = tool({
  description:
    "Create a new side-business project for the user. Use when they say 'start a project for X', 'spin up Y', 'add a new venture', etc.",
  inputSchema: z.object({
    name: z.string().describe("Display name (e.g. 'Lemon Lab')."),
    description: z.string().optional(),
    status: z
      .enum(["idea", "active", "paused", "shipped", "archived"])
      .optional()
      .describe("Defaults to 'active'."),
    target_date: z
      .string()
      .optional()
      .describe("Optional soft deadline in YYYY-MM-DD."),
    color: z
      .string()
      .optional()
      .describe("Optional accent color (any CSS color string)."),
  }),
  execute: async (input) => {
    const result = await createProjectCore({
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      target_date: input.target_date ?? null,
      color: input.color ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Project created: ${result.data.name} (status=${result.data.status}). Slug: ${result.data.slug}.`,
      project: result.data,
    };
  },
});

export const addProjectMilestoneTool = tool({
  description:
    "Add a milestone (big rock) to an existing project — e.g. 'MVP shipped', 'first paying customer', 'beta launch'. Use when the user says 'add a milestone to X' or describes a goal for one of their side hustles.",
  inputSchema: z.object({
    project: z
      .string()
      .describe("Project name or slug. Resolved server-side; fuzzy match supported."),
    title: z.string().describe("Short milestone title."),
    description: z.string().optional(),
    target_date: z
      .string()
      .optional()
      .describe("Optional target date in YYYY-MM-DD."),
  }),
  execute: async (input) => {
    const project = await findProjectCore(input.project.trim());
    if (!project)
      return { ok: false, error: `No project matches "${input.project}".` };
    const result = await createMilestoneCore({
      project_id: project.id,
      title: input.title,
      description: input.description ?? null,
      target_date: input.target_date ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Milestone added to ${project.name}: "${result.data.title}"`,
      milestone: result.data,
    };
  },
});

export const completeProjectMilestoneTool = tool({
  description:
    "Mark a milestone as complete. Resolves the milestone by fuzzy title match within the specified project.",
  inputSchema: z.object({
    project: z.string().describe("Project name or slug."),
    milestone_title: z
      .string()
      .describe("Milestone title (case-insensitive substring match within the project)."),
  }),
  execute: async (input) => {
    const project = await findProjectCore(input.project.trim());
    if (!project)
      return { ok: false, error: `No project matches "${input.project}".` };
    const milestone = await findMilestoneCore(project.id, input.milestone_title);
    if (!milestone)
      return {
        ok: false,
        error: `No milestone in ${project.name} matches "${input.milestone_title}".`,
      };
    const result = await setMilestoneCompletedCore(milestone.id, true);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Marked complete: ${project.name} → ${result.data.title}`,
      milestone: result.data,
    };
  },
});

export const updateProjectStatusTool = tool({
  description:
    "Change a project's status — e.g. mark as 'shipped' when launched, 'paused' when shelved, 'archived' to hide from defaults.",
  inputSchema: z.object({
    project: z.string().describe("Project name or slug."),
    status: z.enum(["idea", "active", "paused", "shipped", "archived"]),
  }),
  execute: async (input) => {
    const project = await findProjectCore(input.project.trim());
    if (!project)
      return { ok: false, error: `No project matches "${input.project}".` };
    const result = await updateProjectCore(project.id, { status: input.status });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `${project.name} → status: ${result.data.status}`,
      project: result.data,
    };
  },
});

export const readProjectRepoTool = tool({
  description:
    "Read from the GitHub repo linked to one of the user's side-business projects. Use when the user asks code/repo questions about a specific project (e.g. 'what's in the Lemon Lab readme', 'list the files in Saffron Studio', 'show me lib/foo.ts from Beta', 'what are the latest commits on Lemon Lab'). The project must have a github_repo_url set — if it doesn't, surface that and ask the user to add one on the project page.",
  inputSchema: z.object({
    project: z
      .string()
      .describe("Project name or slug. Fuzzy resolver — server picks the best match."),
    section: z
      .enum(["readme", "tree", "file", "commits", "meta"])
      .describe(
        "Which slice of the repo to fetch. 'readme' = decoded README text. 'tree' = recursive file listing. 'file' = a single file's contents (also pass `path`). 'commits' = recent commits. 'meta' = repo metadata (default branch, language, last push).",
      ),
    path: z
      .string()
      .optional()
      .describe(
        "Required when section='file' — repo-relative path like 'lib/foo.ts'. Ignored for other sections.",
      ),
    branch: z
      .string()
      .optional()
      .describe(
        "Branch/ref to read from. Defaults to the repo's default branch (cached on the project row if known, otherwise resolved via the GitHub API).",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("For section='commits': max commits to return (default 10, capped at 50)."),
  }),
  execute: async (input) => {
    const project = await findProjectCore(input.project.trim());
    if (!project)
      return { ok: false, error: `No project matches "${input.project}".` };
    const url = project.github_repo_url?.trim();
    if (!url)
      return {
        ok: false,
        error: `Project "${project.name}" has no github_repo_url set. Open /projects/${project.slug} and add one.`,
      };
    const ref = parseRepoUrl(url);
    if (!ref)
      return {
        ok: false,
        error: `Could not parse "${url}" as a github.com repo URL.`,
      };

    // Resolve the branch lazily: prefer caller > stored default > live default.
    async function resolveBranch(): Promise<
      { ok: true; branch: string } | { ok: false; error: string }
    > {
      if (input.branch && input.branch.trim()) {
        return { ok: true, branch: input.branch.trim() };
      }
      if (project!.github_default_branch) {
        return { ok: true, branch: project!.github_default_branch };
      }
      const meta = await fetchRepoMetadata(ref!);
      if (!meta.ok) return { ok: false, error: meta.error };
      return { ok: true, branch: meta.data.default_branch };
    }

    if (input.section === "meta") {
      const meta = await fetchRepoMetadata(ref);
      if (!meta.ok) return { ok: false, error: meta.error };
      return {
        ok: true,
        project: project.name,
        repo: meta.data.full_name,
        meta: meta.data,
      };
    }

    if (input.section === "readme") {
      const readme = await fetchRepoReadme(ref);
      if (!readme.ok) return { ok: false, error: readme.error };
      return {
        ok: true,
        project: project.name,
        repo: `${ref.owner}/${ref.repo}`,
        path: readme.data.path,
        content: readme.data.content,
      };
    }

    if (input.section === "tree") {
      const branch = await resolveBranch();
      if (!branch.ok) return { ok: false, error: branch.error };
      const tree = await fetchRepoTree(ref, branch.branch);
      if (!tree.ok) return { ok: false, error: tree.error };
      // Cap entries so we don't blow the response size on huge repos.
      const CAP = 400;
      const entries = tree.data.entries.slice(0, CAP);
      return {
        ok: true,
        project: project.name,
        repo: `${ref.owner}/${ref.repo}`,
        branch: branch.branch,
        truncated: tree.data.truncated || tree.data.entries.length > CAP,
        count: entries.length,
        entries,
      };
    }

    if (input.section === "file") {
      if (!input.path || !input.path.trim())
        return {
          ok: false,
          error: "section='file' requires a `path` argument.",
        };
      const branch = await resolveBranch();
      if (!branch.ok) return { ok: false, error: branch.error };
      const file = await fetchRepoFile(ref, input.path.trim(), branch.branch);
      if (!file.ok) return { ok: false, error: file.error };
      return {
        ok: true,
        project: project.name,
        repo: `${ref.owner}/${ref.repo}`,
        branch: branch.branch,
        path: file.data.path,
        size: file.data.size,
        content: file.data.content,
      };
    }

    // section === "commits"
    const branch = await resolveBranch();
    if (!branch.ok) return { ok: false, error: branch.error };
    const commits = await fetchRecentCommits(ref, branch.branch, input.limit ?? 10);
    if (!commits.ok) return { ok: false, error: commits.error };
    return {
      ok: true,
      project: project.name,
      repo: `${ref.owner}/${ref.repo}`,
      branch: branch.branch,
      count: commits.data.length,
      commits: commits.data,
    };
  },
});

// ---------- skill tools ----------

export const createSkillTool = tool({
  description:
    "Author a new Jarvis Skill — a reusable behavior bundle the user can trigger by keyword. Use this when the user says 'make me a skill that…', 'teach Jarvis to…', or describes a recurring workflow they want bundled. Pick a short imperative name, 1-line description, and 2-5 trigger keywords/phrases. Write the instructions in second person addressed to Jarvis. Confirm the saved skill back to the user in one sentence.",
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        "Short imperative title (2-4 words). Used as the unique skill name.",
      ),
    description: z
      .string()
      .describe("One-sentence summary of what this skill does."),
    instructions: z
      .string()
      .describe(
        "Markdown body of the skill, addressed to Jarvis in second person. Be concrete about behavior. 100-300 words is the sweet spot.",
      ),
    trigger_keywords: z
      .array(z.string())
      .min(1)
      .describe(
        "Lowercase keywords/phrases that activate this skill when present in a user message. Substring match.",
      ),
  }),
  execute: async (input) => {
    const result = await createSkillCore({
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      trigger_keywords: input.trigger_keywords,
      source: "jarvis",
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Skill saved: ${result.data.name} · triggers: ${result.data.trigger_keywords.join(", ")}`,
      skill: result.data,
    };
  },
});

// ---------- query + brief tools ----------

export const queryStateTool = tool({
  description:
    "Read-only snapshot of the user's current state. Call this before answering any question that requires real numbers.",
  inputSchema: z.object({
    domain: z
      .enum([
        "tasks",
        "events",
        "wife_shifts",
        "wfh_status",
        "skills",
        "projects",
        "all",
      ])
      .describe("Which domain(s) to fetch. 'all' returns a summary across everything."),
  }),
  execute: async ({ domain }) => {
    const out: Record<string, unknown> = {};

    if (domain === "tasks" || domain === "all") {
      const tasks = await listTasks();
      out.tasks = {
        total: tasks.length,
        open: tasks.filter((t) => t.status !== "done").length,
        by_status: tasks.reduce<Record<string, number>>((acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        }, {}),
        open_items: tasks
          .filter((t) => t.status !== "done")
          .map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            due_at: t.due_at,
          })),
      };
    }

    if (domain === "events" || domain === "all") {
      const events = await listUpcomingEventsCore(10);
      out.events = {
        upcoming: events.map((e) => ({
          id: e.id,
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          location: e.location,
        })),
      };
    }

    if (domain === "wife_shifts" || domain === "all") {
      const shifts = await listUpcomingWifeShifts(21);
      out.wife_shifts = {
        next_21_days: shifts.map((s) => ({
          shift_date: s.shift_date,
          code: s.code,
        })),
      };
    }

    if (domain === "wfh_status" || domain === "all") {
      const rows = await listUpcomingWfhStatus(21);
      out.wfh_status = {
        next_21_days: rows.map((r) => ({
          status_date: r.status_date,
          status: r.status,
        })),
      };
    }

    if (domain === "skills" || domain === "all") {
      const skills = await listActiveSkills();
      out.skills = {
        count: skills.length,
        items: skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          trigger_keywords: s.trigger_keywords,
        })),
      };
    }

    if (domain === "projects" || domain === "all") {
      const projects = await listProjectSummaries();
      out.projects = {
        count: projects.length,
        items: projects.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status,
          task_pct: p.task_pct,
          milestone_pct: p.milestone_pct,
          open_tasks: p.open_task_count,
          done_tasks: p.done_task_count,
          milestones: `${p.milestone_done}/${p.milestone_total}`,
          next_milestone: p.next_milestone,
          target_date: p.target_date,
        })),
      };
    }

    return { ok: true, snapshot: out };
  },
});

export const searchPastConversationsTool = tool({
  description:
    "Search the full history of past chat messages by keyword. Use this when the user references a prior conversation — 'what did I say about X', 'last time we talked about Y', 'when did I mention Z'. Do NOT use for current-state questions about tasks/events/projects (use query_state instead). Returns up to 25 recent matches with short snippets. Quote the snippet back when surfacing the answer so Tyler can see exactly what was said.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe(
        "Plain-language keyword query. Multi-word phrases are AND-ed (Postgres plainto_tsquery, English stemmer). Example: 'coffee preference' matches messages containing both 'coffee' and 'prefer*'.",
      ),
    since: z
      .string()
      .optional()
      .describe("ISO 8601 timestamp — only return messages created on/after this instant."),
    until: z
      .string()
      .optional()
      .describe("ISO 8601 timestamp — only return messages created strictly before this instant."),
    agent_slug: z
      .string()
      .optional()
      .describe(
        "Filter to messages from one sub-agent thread. Omit to include the main Jarvis thread; pass 'main' to restrict to the main thread only (agent_slug IS NULL).",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Max matches to return (default 10, capped at 25)."),
  }),
  execute: async ({ query, since, until, agent_slug, limit }) => {
    const slugArg =
      agent_slug === undefined
        ? undefined
        : agent_slug === "main"
          ? null
          : agent_slug;
    const hits = await searchChatMessagesCore({
      query,
      since,
      until,
      agent_slug: slugArg,
      limit,
    });
    return {
      ok: true,
      query,
      count: hits.length,
      hits,
    };
  },
});

export const generateBriefTool = tool({
  description:
    "Run the brief generator (rule-based or Claude depending on env) and persist the result. Returns the generated brief.",
  inputSchema: z.object({
    kind: z.enum(["morning", "evening"]),
  }),
  execute: async ({ kind }) => {
    const result = await runBrief(kind);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `${kind} brief generated.`,
      summary: result.brief.summary,
      bullets: result.brief.bullets,
      engine: result.brief.engine,
    };
  },
});

// ---------- agent delegation ----------

export const delegateToAgentTool = tool({
  description:
    "Delegate a focused task to a sub-agent (Daily Planner, Scheduler, Finance Analyst, Quick Capture, or any custom agent the user has authored). Use this for specialized work where a dedicated prompt + tool subset will produce a sharper result than handling it inline. The agent runs in an isolated reasoning loop with only its allowlisted tools and returns a final text result. After it returns you MUST report back to Tyler with an explicit completion report — lead with a ✓ and the agent's name, summarize concretely what they did and the outcome, and offer a next step (or ✕ and the reason if it failed). List of available agents lives at /agents — slugs are short kebab-case.",
  inputSchema: z.object({
    agent_slug: z
      .string()
      .describe(
        "Slug of the agent to invoke (e.g. 'planner', 'scheduler', 'finance', 'capture').",
      ),
    task: z
      .string()
      .describe(
        "What the sub-agent should do, phrased as a clear self-contained instruction. The agent does not see prior chat history beyond this string + optional context_summary.",
      ),
    context_summary: z
      .string()
      .optional()
      .describe(
        "Optional short summary of relevant prior conversation context (1-3 sentences). Use to give the agent state it would otherwise be blind to.",
      ),
  }),
  execute: async ({ agent_slug, task, context_summary }) => {
    const agent = await getAgentBySlug(agent_slug);
    if (!agent)
      return { ok: false, error: `No agent matches slug "${agent_slug}".` };
    if (!agent.active)
      return {
        ok: false,
        error: `Agent "${agent.name}" is disabled. Enable it at /agents or pick another.`,
      };

    // Lazy import to avoid a module cycle: agents/run.ts → chat/router.ts →
    // chat/tools.ts (this file).
    const { runAgent } = await import("@/lib/ai/agents/run");
    const result = await runAgent(agent, task, context_summary);

    if (!result.ok) return { ok: false, error: result.error };
    const calls = result.tool_calls.length;
    const callsSuffix =
      calls === 0 ? "no tool calls" : `${calls} tool call${calls === 1 ? "" : "s"}`;
    return {
      ok: true,
      message: `→ ${agent.name} (${callsSuffix})`,
      agent_name: agent.name,
      agent_slug: agent.slug,
      agent_color: agent.color,
      result: result.text,
      tool_calls_count: calls,
      tool_calls: result.tool_calls.map((c) => c.name),
    };
  },
});

// ---------- memory tools ----------

export const rememberTool = tool({
  description:
    "Persist a NEW durable fact about Tyler so you recall it in future conversations. Use this when he reveals something stable and worth keeping — a preference, a person in his life, a health detail, how he works, a standing goal ('remember that…', 'just so you know…', 'I prefer…'). The fact is injected into your system prefix on future turns. Keep `key` short (2-6 words) and `value` a single concrete sentence. To CHANGE a fact already in the REMEMBERED block, use update_memory instead — do not create a near-duplicate. Never store transient state (today's tasks, current mood). A background pass also reconciles memory after each turn, so reserve this for facts Tyler clearly wants kept.",
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        "Short dictionary-style label. Examples: 'coffee preference', 'wife name', 'peanut allergy'.",
      ),
    value: z
      .string()
      .describe("The fact itself, written as a clear declarative sentence."),
    kind: z
      .enum(MEMORY_KINDS)
      .describe(
        "identity = who he is; preference = how he likes things; relationship = a person in his life; health; work; routine = recurring habit/schedule; goal = a standing objective; knowledge = other durable fact; context = situational background.",
      ),
    confidence: z
      .enum(["high", "medium", "low"])
      .optional()
      .describe("Defaults to 'high' when the user states it explicitly."),
    pinned: z
      .boolean()
      .optional()
      .describe(
        "Pin if this is a core, always-relevant fact (e.g. allergies, family). Pinned entries are always included in the prefix.",
      ),
  }),
  execute: async (input) => {
    const result = await createMemoryCore({
      kind: input.kind,
      key: input.key,
      value: input.value,
      source: "user",
      confidence: input.confidence ?? "high",
      pinned: input.pinned ?? false,
      scope: "global",
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Remembered: ${result.data.key}`,
      memory_id: result.data.id,
    };
  },
});

export const updateMemoryTool = tool({
  description:
    "Refine or correct an existing memory by id. Use when Tyler gives a fuller or more accurate version of something already in the REMEMBERED block ('actually it's…', 'also…'), or to re-pin it / change its kind. Pass only the fields that change. To add a brand-new fact use remember; to drop one use forget.",
  inputSchema: z.object({
    memory_id: z
      .string()
      .describe("id of the memory to update (from the REMEMBERED block)."),
    value: z
      .string()
      .optional()
      .describe("Replacement value — a full declarative sentence."),
    key: z.string().optional().describe("Replacement short label."),
    kind: z.enum(MEMORY_KINDS).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    pinned: z
      .boolean()
      .optional()
      .describe("Set true to always include this entry in the prefix."),
  }),
  execute: async ({ memory_id, ...patch }) => {
    const result = await updateMemoryCore(memory_id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Updated memory: ${result.data.key}`,
      memory: {
        id: result.data.id,
        key: result.data.key,
        value: result.data.value,
      },
    };
  },
});

export const searchMemoryTool = tool({
  description:
    "Search Tyler's full long-term memory store by meaning or keyword. Your system prefix already lists the most relevant memories every turn — use this tool only when you need a fact that may not be shown there (an older or narrowly-scoped detail). Returns matching entries with their ids.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe("What to look for — a topic, a person, or a keyword."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Max results to return (default 10)."),
  }),
  execute: async ({ query, limit }) => {
    const hits = await searchMemoriesCore(query, limit ?? 10);
    return {
      ok: true,
      query,
      count: hits.length,
      memories: hits.map((m) => ({
        id: m.id,
        kind: m.kind,
        key: m.key,
        value: m.value,
        pinned: m.pinned,
      })),
    };
  },
});

export const saveIdeaTool = tool({
  description:
    "Capture a fleeting idea or thought so Tyler can revisit it on /ideas. Use this when he says 'save this idea', 'idea:', 'here's a thought', 'remember this thought', or sketches an unrefined concept he wants to keep ('what if we…', 'an idea: …'). NOT for committed work (use add_task), durable facts about him (use remember), or anything time-sensitive. Pick a short headline for `title` (3-8 words) and put the detail in `body`.",
  inputSchema: z.object({
    title: z
      .string()
      .min(1)
      .describe("Short headline for the idea (3-8 words)."),
    body: z
      .string()
      .optional()
      .describe("Detail or sketch of the idea. 1-3 sentences typically."),
    pinned: z
      .boolean()
      .optional()
      .describe("Pin if this is high-priority and should float to the top."),
  }),
  execute: async (input) => {
    const result = await createIdeaCore({
      title: input.title,
      body: input.body,
      pinned: input.pinned ?? false,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      idea_id: result.data.id,
      message: `Saved: "${result.data.title}"`,
    };
  },
});

export const saveNoteTool = tool({
  description:
    "Dump a free-form note into Tyler's /notes page. Use this when he says 'note:', 'save this note', 'jot this down', 'note that …', 'add to notes', or shares a chunk of reference content he wants to keep around (a recipe, a packing list, meeting notes, a code snippet, an article summary, a quote, troubleshooting steps). Pick a short `category` that groups related notes (e.g. 'travel', 'recipes', 'work', 'tech', 'books', 'health', 'shopping'). Reuse an existing category from `read_notes({ list_categories: true })` if a close match already exists — don't proliferate near-duplicates. `body` is the actual note content; `title` is an optional headline (3-8 words). NOT for fleeting ideas (use save_idea), durable facts about him (use remember), or actionable to-dos (use add_task).",
  inputSchema: z.object({
    body: z
      .string()
      .min(1)
      .describe("The note content. Verbatim is fine — Tyler will edit it on the web UI if he wants to."),
    category: z
      .string()
      .optional()
      .describe(
        "Short topic slug grouping related notes. Lowercase, dash-separated. Defaults to 'general' if omitted.",
      ),
    title: z
      .string()
      .optional()
      .describe("Optional short headline. If omitted, the card shows 'untitled'."),
    pinned: z
      .boolean()
      .optional()
      .describe("Pin if this should float to the top of the notes list."),
  }),
  execute: async (input) => {
    const result = await createNoteCore({
      title: input.title,
      body: input.body,
      category: input.category,
      pinned: input.pinned ?? false,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      note_id: result.data.id,
      category: result.data.category,
      message: `Saved to /notes · ${result.data.category}`,
    };
  },
});

export const updateNoteTool = tool({
  description:
    "Edit an existing note in /notes. Use when Tyler says 'add to that note', 'update the recipe note', 'change the category to X', or wants to amend something he previously saved. Look up the note id via `read_notes` first if you don't have it. Only the fields you pass get changed — omit the rest.",
  inputSchema: z.object({
    note_id: z.string().describe("The id of the note to update."),
    title: z.string().optional(),
    body: z
      .string()
      .optional()
      .describe(
        "Full replacement body. To append, fetch the existing body via read_notes and pass `oldBody + '\\n\\n' + newContent`.",
      ),
    category: z.string().optional(),
    pinned: z.boolean().optional(),
  }),
  execute: async ({ note_id, ...patch }) => {
    const result = await updateNoteCore(note_id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: `Updated note "${result.data.title || result.data.id}"` };
  },
});

export const readNotesTool = tool({
  description:
    "Read or search notes Tyler has saved in /notes. Use when he references a previous note ('what was in my recipe note', 'remind me what I wrote about Tokyo'), or when you need to check existing categories before saving a new note (so you reuse 'travel' instead of inventing 'trips'). Pass `query` for keyword search, `category` to filter, or `list_categories: true` for a cheap category catalog.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Keyword to search title + body. Case-insensitive."),
    category: z
      .string()
      .optional()
      .describe("Filter to a single category slug."),
    list_categories: z
      .boolean()
      .optional()
      .describe("If true, return only the list of categories with counts."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results. Defaults to 20."),
  }),
  execute: async ({ query, category, list_categories, limit }) => {
    if (list_categories) {
      const cats = await listNoteCategoriesCore();
      return { ok: true, categories: cats };
    }
    const limitN = limit ?? 20;
    const notes = query
      ? await searchNotesCore(query, { limit: limitN, category })
      : (await listNotesCore({ category })).slice(0, limitN);
    return {
      ok: true,
      count: notes.length,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        category: n.category,
        pinned: n.pinned,
        body: n.body,
        updated_at: n.updated_at ?? n.created_at,
      })),
    };
  },
});

export const getBriefPromptTool = tool({
  description:
    "Read the current system prompt used to generate Tyler's morning or evening brief. Use this when he asks to see, review, or edit the brief prompt — fetch it first so you can show him what's active and propose an edit. Returns the active prompt (override if set, otherwise the default) plus a flag indicating which.",
  inputSchema: z.object({
    kind: z
      .enum(["morning", "evening"])
      .describe("Which brief — morning (start-of-day) or evening (review)."),
  }),
  execute: async ({ kind }) => {
    const settings = await getPromptSettingsCore();
    const override =
      kind === "morning"
        ? settings.morning_brief_prompt
        : settings.evening_brief_prompt;
    const active =
      override && override.trim()
        ? override
        : kind === "morning"
          ? DEFAULT_MORNING_BRIEF_PROMPT
          : DEFAULT_EVENING_BRIEF_PROMPT;
    return {
      ok: true,
      kind,
      using_override: Boolean(override && override.trim()),
      prompt: active,
    };
  },
});

export const setBriefPromptTool = tool({
  description:
    "Edit the system prompt used to generate Tyler's morning or evening brief. Use when he says 'change my morning brief prompt to…', 'edit the evening brief', 'reset the morning brief to default', etc. The brief is the dashboard summary generated twice daily — it must remain a system prompt that emits JSON in the shape { summary, bullets: [{ label, value, severity }] }, so preserve that output contract when rewriting. Call get_brief_prompt first if you don't already have the current text. Pass `clear: true` to drop the override and fall back to the hardcoded default.",
  inputSchema: z.object({
    kind: z
      .enum(["morning", "evening"])
      .describe("Which brief to edit."),
    prompt: z
      .string()
      .optional()
      .describe(
        "Full replacement prompt text. Must preserve the JSON output contract — describe the schema explicitly. Omit when clearing.",
      ),
    clear: z
      .boolean()
      .optional()
      .describe("If true, clear the override and revert to the built-in default. Ignores `prompt`."),
  }),
  execute: async ({ kind, prompt, clear }) => {
    if (!clear && (!prompt || !prompt.trim())) {
      return {
        ok: false,
        error:
          "Pass either `prompt` (the new text) or `clear: true` to revert to the default.",
      };
    }
    const field =
      kind === "morning" ? "morning_brief_prompt" : "evening_brief_prompt";
    const result = await upsertPromptSettingsCore({
      [field]: clear ? null : prompt!,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      kind,
      cleared: Boolean(clear),
      message: clear
        ? `Reset the ${kind} brief prompt to the built-in default.`
        : `Updated the ${kind} brief prompt. Takes effect on the next brief run.`,
    };
  },
});

export const forgetTool = tool({
  description:
    "Archive a stored memory by id when it no longer holds or Tyler says 'forget that'. The entry is removed from your prefix but kept (recoverable) on the /memory page — it is not permanently deleted. If Tyler is CORRECTING a fact rather than dropping it, prefer update_memory. The memory_id is visible in the REMEMBERED section of your system prefix.",
  inputSchema: z.object({
    memory_id: z.string().describe("The id of the memory entry to archive."),
  }),
  execute: async ({ memory_id }) => {
    const result = await archiveMemoryCore(memory_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Memory archived." };
  },
});

// ---------- cron jobs ----------

import {
  createCronJobCore,
  deleteCronJobCore,
  listCronJobsCore,
  updateCronJobCore,
  validateSchedule,
} from "@/lib/db/core/cron-jobs";

export const createCronJobTool = tool({
  description:
    "Schedule a recurring automation that runs a Jarvis prompt on a cron schedule. Use when the user says 'every morning…', 'remind me every…', 'run X daily at…', etc. Schedule is a standard 5-field UTC cron expression (e.g. '0 8 * * *' = 8am UTC daily). The prompt is sent to Jarvis as a chat turn when the job fires — results go to Telegram and the chat thread.",
  inputSchema: z.object({
    name: z.string().describe("Short display name for the automation (e.g. 'Morning Brief')."),
    description: z.string().optional().describe("One-line description of what it does."),
    schedule: z
      .string()
      .describe(
        "5-field UTC cron expression. Examples: '0 8 * * *' = 8am daily, '0 9 * * 1' = Monday 9am, '*/30 * * * *' = every 30 min.",
      ),
    prompt: z
      .string()
      .describe(
        "What Jarvis should do when the job fires. Write it as a direct instruction, e.g. 'Generate my morning brief' or 'Add a task: review weekly goals'.",
      ),
  }),
  execute: async (input) => {
    if (!validateSchedule(input.schedule)) {
      return { ok: false, error: `Invalid cron expression: "${input.schedule}". Use 5-field UTC syntax.` };
    }
    const result = await createCronJobCore({
      name: input.name,
      description: input.description ?? null,
      schedule: input.schedule,
      prompt: input.prompt,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Cron job scheduled: "${result.data.name}" — ${input.schedule}. Next run: ${result.data.next_run_at}.`,
      job: result.data,
    };
  },
});

export const listCronJobsTool = tool({
  description: "List all scheduled cron automations.",
  inputSchema: z.object({}),
  execute: async () => {
    const jobs = await listCronJobsCore();
    return {
      ok: true,
      count: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        schedule: j.schedule,
        prompt: j.prompt,
        active: j.active,
        last_run_at: j.last_run_at,
        next_run_at: j.next_run_at,
      })),
    };
  },
});

export const toggleCronJobTool = tool({
  description: "Enable or disable a cron job by id.",
  inputSchema: z.object({
    job_id: z.string(),
    active: z.boolean().describe("true to enable, false to disable."),
  }),
  execute: async ({ job_id, active }) => {
    const result = await updateCronJobCore(job_id, { active });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `"${result.data.name}" ${active ? "enabled" : "disabled"}.`,
    };
  },
});

export const deleteCronJobTool = tool({
  description: "Permanently delete a cron job by id.",
  inputSchema: z.object({ job_id: z.string() }),
  execute: async ({ job_id }) => {
    const result = await deleteCronJobCore(job_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Cron job deleted." };
  },
});

// ---------- web search ----------

export const webSearchTool = tool({
  description:
    "Search the live web and return a synthesized answer with source citations. Use for any question whose answer depends on real-world facts that change over time: flight schedules and prices, hotel availability, news, weather, sports scores, current product specs, visa rules, exchange rates, store hours, who-just-won-X, what-just-happened. Do NOT use for things in the user's own data (tasks/events/projects — use query_state) or for code questions (use read_project_repo). Quote prices/dates exactly as the answer reports them; never round or paraphrase numbers.",
  inputSchema: z.object({
    query: z
      .string()
      .min(3)
      .describe(
        "Natural-language search query. Be specific — include dates, cities, brand names, model numbers when relevant. Example: 'cheapest one-way economy SFO to NRT departing 2026-06-01, max 1 stop'.",
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe(
        "How many web results to scrape and feed into the answer. Defaults to 5. Bump to 8-10 for broad research questions, drop to 2-3 for tightly-scoped fact lookups.",
      ),
    recency: z
      .enum(["day", "week", "month", "year"])
      .optional()
      .describe(
        "Bias results toward sources published within this window. Use 'day' or 'week' for breaking news / live status, 'month' for recent reviews, 'year' for general up-to-date info. Omit for evergreen queries.",
      ),
  }),
  execute: async ({ query, max_results, recency }) => {
    const result = await webSearch({ query, max_results, recency });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      query: result.query,
      answer: result.answer,
      citations: result.citations,
      cost_usd: result.cost_usd,
    };
  },
});

// ---------- vision ----------

export const visionAnalyzeTool = tool({
  description:
    "Analyze an image using Claude Sonnet vision. Use this when the user shares an image URL and asks what's in it, wants a description, needs text extracted from a screenshot, or asks any question about an image.",
  inputSchema: z.object({
    image_url: z
      .string()
      .describe(
        "Publicly accessible image URL (https://…) or a base64 data URI (data:image/…;base64,…).",
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        "What to look for or analyze. Defaults to a general description including text, objects, people, colors, and context.",
      ),
  }),
  execute: async ({ image_url, prompt }) => {
    const { isClaudeEnabled } = await import(
      "@/lib/db/core/site-settings"
    );
    if (!(await isClaudeEnabled())) {
      return {
        ok: false,
        error:
          "Vision analysis is temporarily disabled. Re-enable Claude from the StatusRail toggle on the dashboard.",
      };
    }
    try {
      const image = image_url.startsWith("http")
        ? new URL(image_url)
        : image_url; // data URI or raw base64
      const { text } = await generateText({
        model: anthropic("claude-sonnet-4-6"),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image },
              {
                type: "text",
                text:
                  prompt ??
                  "Describe this image in detail. Note any text, objects, people, colors, and overall context.",
              },
            ],
          },
        ],
        maxOutputTokens: 1024,
      });
      return { ok: true, analysis: text };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Vision analysis failed.",
      };
    }
  },
});

// ---------- places ----------

export const savePlaceTool = tool({
  description:
    "Save a restaurant / cafe / bar / activity to Tyler's places shortlist — the spots he wants to visit, used later for date planning. Use this whenever Tyler forwards an Instagram or Threads post (pass its URL as `url` — the tool fetches the post, reads the caption, and extracts the venue automatically), OR when he names a spot he wants to try in chat (pass `name` and whatever else he gave you, `source` stays manual). If the tool returns `needs_confirmation: true`, the post could not be read (private/blocked) — ask Tyler for the place name and city in ONE short question, then call save_place again with the explicit `name`/`city` AND the same `url`. Explicit fields you pass always override what the extractor inferred.",
  inputSchema: z.object({
    url: z
      .string()
      .optional()
      .describe(
        "Instagram or Threads post URL to fetch and extract. Pass this whenever Tyler forwarded a post link.",
      ),
    name: z
      .string()
      .optional()
      .describe(
        "Explicit venue name. Required when there is no URL; also used to override or rescue a failed extraction.",
      ),
    category: z
      .enum(PLACE_CATEGORIES)
      .optional()
      .describe("restaurant / cafe / bar / dessert / activity / other."),
    cuisine: z.string().optional().describe("e.g. 'italian', 'omakase'."),
    city: z.string().optional(),
    area: z.string().optional().describe("Neighborhood or district."),
    address: z.string().optional(),
    price_level: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("1 (cheap) to 4 (expensive)."),
    notes: z.string().optional().describe("Any extra context Tyler added."),
  }),
  execute: async (input) => {
    const overrides = {
      category: input.category,
      cuisine: input.cuisine,
      city: input.city,
      area: input.area,
      address: input.address,
      price_level: input.price_level,
      notes: input.notes,
    };

    // --- URL path: fetch the post, extract the venue. ---
    if (input.url && input.url.trim()) {
      const post = detectPostUrl(input.url);
      if (!post) {
        if (!input.name) {
          return {
            ok: false,
            error:
              "That URL isn't a recognized Instagram or Threads post. Pass a place `name` to save it manually.",
          };
        }
        // Not a post URL but Tyler named the place — save manually.
        const r = await createPlaceCore({
          name: input.name,
          source: "manual",
          ...overrides,
        });
        if (!r.ok) return { ok: false, error: r.error };
        return {
          ok: true,
          existed: r.existed,
          place: r.data,
          message: `Saved ${r.data.name} to your places list.`,
        };
      }

      const fetched = await fetchPost(post.url);

      if (fetched.ok) {
        const extracted = await extractPlace({
          caption: fetched.caption,
          handle: fetched.handle,
          locationHint: fetched.locationHint,
          imageUrl: fetched.imageUrl,
          platform: fetched.platform,
        });

        const name =
          input.name?.trim() ||
          (extracted.ok && extracted.data.is_place
            ? extracted.data.name.trim()
            : "");

        if (name) {
          const e = extracted.ok ? extracted.data : null;
          const r = await createPlaceCore({
            name,
            category: overrides.category ?? e?.category,
            cuisine: overrides.cuisine ?? e?.cuisine,
            city: overrides.city ?? e?.city,
            area: overrides.area ?? e?.area,
            address: overrides.address ?? e?.address,
            price_level: overrides.price_level ?? e?.price_level,
            notes: overrides.notes,
            source: post.platform,
            source_url: post.url,
            image_url: fetched.imageUrl,
            raw_caption: fetched.caption || null,
          });
          if (!r.ok) return { ok: false, error: r.error };
          return {
            ok: true,
            existed: r.existed,
            place: r.data,
            summary: e?.summary ?? null,
            message: r.existed
              ? `${r.data.name} was already on your places list.`
              : `Saved ${r.data.name} (${r.data.category}${r.data.city ? `, ${r.data.city}` : ""}) to your places list.`,
          };
        }

        // Post read fine but no nameable venue in it.
        return {
          ok: false,
          needs_confirmation: true,
          source_url: post.url,
          reason: extracted.ok ? "no_place_found" : "extraction_failed",
          message:
            "I read that post but couldn't pin down a specific place. What's the spot called, and which city?",
        };
      }

      // Fetch failed — degrade gracefully.
      if (input.name) {
        const r = await createPlaceCore({
          name: input.name,
          source: post.platform,
          source_url: post.url,
          ...overrides,
        });
        if (!r.ok) return { ok: false, error: r.error };
        return {
          ok: true,
          existed: r.existed,
          place: r.data,
          message: `Saved ${r.data.name} to your places list.`,
        };
      }
      return {
        ok: false,
        needs_confirmation: true,
        source_url: post.url,
        reason: fetched.reason,
        message: `I couldn't read that ${post.platform} post (${fetched.message}). What's the place called, and which city?`,
      };
    }

    // --- Manual path: no URL, just a name. ---
    if (input.name && input.name.trim()) {
      const r = await createPlaceCore({
        name: input.name,
        source: "manual",
        ...overrides,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        existed: r.existed,
        place: r.data,
        message: `Saved ${r.data.name} to your places list.`,
      };
    }

    return {
      ok: false,
      error: "Provide a post `url` or a place `name`.",
    };
  },
});

export const findPlacesTool = tool({
  description:
    "Search Tyler's saved places shortlist. Use this for date planning ('schedule a date', 'where should we go', 'pick somewhere to eat') and whenever he asks what's on his list. Defaults to status 'want_to_go' (spots not yet visited or booked). Filter by city, category, or cuisine to match the vibe he's after.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Keyword search over name / cuisine / area / caption."),
    city: z.string().optional(),
    category: z.enum(PLACE_CATEGORIES).optional(),
    cuisine: z
      .string()
      .optional()
      .describe("Substring match on the cuisine field."),
    status: z
      .enum(["want_to_go", "scheduled", "visited"])
      .optional()
      .describe("Defaults to want_to_go."),
  }),
  execute: async ({ query, city, category, cuisine, status }) => {
    const st = status ?? "want_to_go";
    let places = query
      ? await searchPlacesCore(query, { status: st, limit: 40 })
      : await listPlacesCore({ city, category, status: st });

    if (query && city) {
      const c = city.toLowerCase();
      places = places.filter((p) => (p.city ?? "").toLowerCase() === c);
    }
    if (query && category) {
      places = places.filter((p) => p.category === category);
    }
    if (cuisine) {
      const c = cuisine.toLowerCase();
      places = places.filter((p) => (p.cuisine ?? "").toLowerCase().includes(c));
    }

    return {
      ok: true,
      count: places.length,
      status: st,
      places: places.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        cuisine: p.cuisine,
        city: p.city,
        area: p.area,
        price_level: p.price_level,
        status: p.status,
        source_url: p.source_url,
      })),
    };
  },
});

export const updatePlaceStatusTool = tool({
  description:
    "Update a saved place's status. Use 'scheduled' once a date is booked onto the calendar (pass the calendar `event_id` from add_calendar_event and `scheduled_for`), 'visited' after Tyler has been, or 'want_to_go' to put it back on the active shortlist. Look up `place_id` via find_places first.",
  inputSchema: z.object({
    place_id: z.string(),
    status: z.enum(["want_to_go", "scheduled", "visited"]),
    event_id: z
      .string()
      .optional()
      .describe("Calendar event id to link when marking 'scheduled'."),
    scheduled_for: z
      .string()
      .optional()
      .describe("YYYY-MM-DD of the planned visit, when marking 'scheduled'."),
  }),
  execute: async ({ place_id, status, event_id, scheduled_for }) => {
    const result = await updatePlaceStatusCore(place_id, status, {
      ...(event_id !== undefined ? { scheduled_event_id: event_id } : {}),
      ...(scheduled_for !== undefined ? { scheduled_for } : {}),
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `${result.data.name} → ${result.data.status}`,
      place: result.data,
    };
  },
});

// ---------- grocery tools ----------

export const addGroceryItemsTool = tool({
  description:
    "Add one or more items to Tyler's grocery list on /grocery. Use this whenever you produce a shopping list — meal-prep groceries, restock items, anything he says 'add to the grocery list'. Pass a BATCH of items in one call (don't call this once per item); each item carries a free-form `quantity` ('2 lb', '1 dozen', '3') and a `category` from the soft enum. Items already on the list (same name + category, still unchecked) are merged in place rather than duplicated, so re-running a plan is safe. Health Officer: pass `source: 'health-officer'` so the list shows where each item came from.",
  inputSchema: z.object({
    items: z
      .array(
        z.object({
          name: z
            .string()
            .describe(
              "Item name without quantity — 'chicken breast', not '2 lb chicken breast'.",
            ),
          quantity: z
            .string()
            .optional()
            .describe("Free-form amount: '2 lb', '1 dozen', '3', '500 g'."),
          category: z
            .enum(GROCERY_CATEGORIES)
            .optional()
            .describe(
              "produce / bakery / dairy / protein / frozen / pantry / beverage / household / other. Defaults to 'other' if omitted.",
            ),
          note: z
            .string()
            .optional()
            .describe(
              "Short why/context: 'for stir-fry Tue', 'low-fat', 'organic preferred'.",
            ),
        }),
      )
      .min(1)
      .describe("Batch of grocery items to add."),
    source: z
      .enum(["manual", "health-officer", "chat"])
      .optional()
      .describe(
        "Where this list came from. Defaults to 'chat'. Health Officer should pass 'health-officer'.",
      ),
  }),
  execute: async ({ items, source }) => {
    const result = await addGroceryItemsCore(
      items.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? null,
        category: i.category,
        note: i.note ?? null,
        source: source ?? "chat",
      })),
      { defaultSource: source ?? "chat" },
    );
    if (!result.ok) return { ok: false, error: result.error };
    const { inserted, merged } = result.data;
    const summary =
      inserted.length && merged.length
        ? `Added ${inserted.length} new + merged ${merged.length} existing into /grocery.`
        : inserted.length
          ? `Added ${inserted.length} item${inserted.length === 1 ? "" : "s"} to /grocery.`
          : `All ${merged.length} item${merged.length === 1 ? " was" : "s were"} already on /grocery — merged.`;
    return {
      ok: true,
      inserted_count: inserted.length,
      merged_count: merged.length,
      message: summary,
    };
  },
});

export const readGroceryListTool = tool({
  description:
    "Read Tyler's current grocery list (the /grocery page). Use this when he asks 'what's on my grocery list', 'do I need X', 'what am I buying', or before adding items so you can avoid duplicating. Returns items grouped by category, with checked items included only if `include_checked: true`.",
  inputSchema: z.object({
    include_checked: z
      .boolean()
      .optional()
      .describe("Include already-checked items (default false)."),
  }),
  execute: async ({ include_checked }) => {
    const items = await listGroceryItemsCore({
      include_checked: include_checked ?? false,
    });
    const byCategory: Record<string, { name: string; quantity: string | null; checked: boolean; note: string | null }[]> = {};
    for (const it of items) {
      const bucket = byCategory[it.category] ?? (byCategory[it.category] = []);
      bucket.push({
        name: it.name,
        quantity: it.quantity,
        checked: it.checked,
        note: it.note,
      });
    }
    return {
      ok: true,
      total: items.length,
      checked_count: items.filter((i) => i.checked).length,
      by_category: byCategory,
    };
  },
});

export const checkGroceryItemTool = tool({
  description:
    "Mark a grocery item as bought (checked) or put it back on the list. Pass either an `id` (from read_grocery_list) or a `name` for fuzzy lookup. If a name matches multiple items, returns the candidates so you can ask Tyler which one.",
  inputSchema: z.object({
    id: z.string().optional(),
    name: z
      .string()
      .optional()
      .describe(
        "Item name or partial match — case-insensitive substring. Use when you don't have an id.",
      ),
    checked: z
      .boolean()
      .optional()
      .describe("True to mark bought (default), false to uncheck."),
  }),
  execute: async ({ id, name, checked }) => {
    const target = checked ?? true;
    if (id) {
      const r = await setGroceryItemCheckedCore(id, target);
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        message: `${r.data.name} → ${target ? "checked" : "unchecked"}`,
      };
    }
    if (!name)
      return { ok: false, error: "Pass an `id` or a `name` to look up." };
    const matches = await findGroceryItemsByNameCore(name, {
      include_checked: !target,
    });
    if (matches.length === 0)
      return {
        ok: false,
        error: `No grocery item matches "${name}".`,
      };
    if (matches.length > 1) {
      return {
        ok: false,
        needs_confirmation: true,
        message: `Multiple matches for "${name}" — ask which one.`,
        candidates: matches.map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity,
          category: m.category,
        })),
      };
    }
    const r = await setGroceryItemCheckedCore(matches[0].id, target);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      message: `${r.data.name} → ${target ? "checked" : "unchecked"}`,
    };
  },
});

export const deleteGroceryItemTool = tool({
  description:
    "Remove a grocery item from the list (not the same as checking it off — this deletes it outright). Pass `id` or `name`. Also accepts `clear_checked: true` to sweep all currently-checked items at once.",
  inputSchema: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    clear_checked: z
      .boolean()
      .optional()
      .describe("Delete every checked item in one shot."),
  }),
  execute: async ({ id, name, clear_checked }) => {
    if (clear_checked) {
      const r = await clearCheckedGroceryItemsCore();
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        message: `Cleared ${r.data.deleted} checked item${r.data.deleted === 1 ? "" : "s"}.`,
      };
    }
    if (id) {
      const r = await deleteGroceryItemCore(id);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, message: "Deleted." };
    }
    if (!name)
      return {
        ok: false,
        error: "Pass `id`, `name`, or `clear_checked: true`.",
      };
    const matches = await findGroceryItemsByNameCore(name, {
      include_checked: true,
    });
    if (matches.length === 0)
      return { ok: false, error: `No grocery item matches "${name}".` };
    if (matches.length > 1) {
      return {
        ok: false,
        needs_confirmation: true,
        message: `Multiple matches for "${name}" — ask which one.`,
        candidates: matches.map((m) => ({
          id: m.id,
          name: m.name,
          quantity: m.quantity,
          category: m.category,
          checked: m.checked,
        })),
      };
    }
    const r = await deleteGroceryItemCore(matches[0].id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, message: `Removed ${matches[0].name}.` };
  },
});

// ---------- meals ----------

export const logMealTool = tool({
  description:
    "Log a meal Tyler is eating, with structured nutrition macros, onto /kcal. Use this WHENEVER Tyler sends a photo that is food OR explicitly says 'log this meal', 'kcal:', 'track this meal', 'I'm eating…'. When a Telegram photo of food triggers the turn, you (the orchestrator) can see the image inline — analyze it: identify every component, estimate per-item portion + macros, and call this tool ONCE with the totals. Make a concrete estimate even if uncertain — that's the value here; mention major assumptions in `notes`. The photo (when one was sent) is auto-attached server-side, so you don't need to pass an image URL. Macros must roughly reconcile against kcal: protein*4 + carbs*4 + fat*9 ≈ kcal ± 15%. Do not call this for screenshots, receipts, restaurant menus, scenery, or other non-food images.",
  inputSchema: z.object({
    title: z
      .string()
      .describe(
        "Short label for the meal, 3-8 words. Examples: 'Chicken caesar salad', 'Bowl of pho with brisket', 'Protein shake + banana'.",
      ),
    meal_type: z
      .enum(["breakfast", "lunch", "dinner", "snack", "other"])
      .optional()
      .describe(
        "Best guess from time-of-day in your context + visual cues. Defaults to 'other' if you skip it.",
      ),
    items: z
      .array(
        z.object({
          name: z
            .string()
            .describe("Short item name, e.g. 'grilled chicken breast'."),
          quantity: z
            .string()
            .optional()
            .describe("Estimated portion, e.g. '~150g', '1 cup', '2 slices'."),
          kcal: z.number().optional(),
          protein_g: z.number().optional(),
          carbs_g: z.number().optional(),
          fat_g: z.number().optional(),
          fiber_g: z.number().optional(),
        }),
      )
      .min(1)
      .describe("Every distinct component you can see in the meal."),
    kcal: z
      .number()
      .describe(
        "Total estimated calories for the whole meal. Whole number — round to the nearest 5.",
      ),
    protein_g: z
      .number()
      .describe("Total grams of protein, one decimal place max."),
    carbs_g: z.number().describe("Total grams of carbs."),
    fat_g: z.number().describe("Total grams of fat."),
    fiber_g: z.number().optional().describe("Total grams of fiber, if estimable."),
    notes: z
      .string()
      .optional()
      .describe(
        "1-2 sentence caveat on the estimate — portion-size assumptions, hidden ingredients, low-confidence items. Omit when you're confident.",
      ),
    eaten_at: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp WITH the user's local offset. Defaults to now — omit unless Tyler said something like 'log this as breakfast 2 hours ago'.",
      ),
  }),
  execute: async (input) => {
    const photo = getMealPhotoContext();
    const result = await createMealCore({
      title: input.title,
      meal_type: input.meal_type ?? null,
      items: input.items,
      kcal: input.kcal,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
      fiber_g: input.fiber_g ?? null,
      notes: input.notes ?? null,
      photo_url: photo?.publicUrl ?? null,
      source: photo ? "telegram" : "chat",
      eaten_at: input.eaten_at,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const m = result.data;
    return {
      ok: true,
      meal_id: m.id,
      message: `Logged ${m.title} — ${m.kcal} kcal · ${m.protein_g}P / ${m.carbs_g}C / ${m.fat_g}F.`,
      summary: {
        title: m.title,
        meal_type: m.meal_type,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
        item_count: m.items.length,
      },
    };
  },
});

export const readMealsTool = tool({
  description:
    "Read Tyler's recent logged meals from /kcal. Use when he asks 'what did I eat today', 'how many calories so far', 'today's macros', 'how much protein this week'. Returns most-recent-first. Pass `since` (ISO 8601) for a day/week window — otherwise defaults to the last 24 hours.",
  inputSchema: z.object({
    since: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp — only return meals eaten on/after this instant. Defaults to 24h ago.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max meals to return (default 20)."),
  }),
  execute: async ({ since, limit }) => {
    const sinceIso =
      since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const meals = await listMealsCore({ since: sinceIso, limit: limit ?? 20 });
    const totals = meals.reduce(
      (acc, m) => ({
        kcal: acc.kcal + Number(m.kcal ?? 0),
        protein_g: acc.protein_g + Number(m.protein_g ?? 0),
        carbs_g: acc.carbs_g + Number(m.carbs_g ?? 0),
        fat_g: acc.fat_g + Number(m.fat_g ?? 0),
      }),
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    return {
      ok: true,
      since: sinceIso,
      count: meals.length,
      totals: {
        kcal: Math.round(totals.kcal),
        protein_g: Math.round(totals.protein_g * 10) / 10,
        carbs_g: Math.round(totals.carbs_g * 10) / 10,
        fat_g: Math.round(totals.fat_g * 10) / 10,
      },
      meals: meals.map((m) => ({
        id: m.id,
        eaten_at: m.eaten_at,
        meal_type: m.meal_type,
        title: m.title,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
        item_count: m.items.length,
      })),
    };
  },
});

// ---------- registry ----------

export const ALL_TOOLS = {
  add_task: addTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  add_calendar_event: addCalendarEventTool,
  update_event: updateEventTool,
  move_event: moveEventTool,
  delete_event: deleteEventTool,
  list_events_in_range: listEventsInRangeTool,
  list_wife_shifts: listWifeShiftsTool,
  set_wfh_status: setWfhStatusTool,
  clear_wfh_status: clearWfhStatusTool,
  list_wfh_status: listWfhStatusTool,
  add_project: addProjectTool,
  add_project_milestone: addProjectMilestoneTool,
  complete_project_milestone: completeProjectMilestoneTool,
  update_project_status: updateProjectStatusTool,
  read_project_repo: readProjectRepoTool,
  create_skill: createSkillTool,
  query_state: queryStateTool,
  search_past_conversations: searchPastConversationsTool,
  generate_brief: generateBriefTool,
  delegate_to_agent: delegateToAgentTool,
  remember: rememberTool,
  update_memory: updateMemoryTool,
  search_memory: searchMemoryTool,
  forget: forgetTool,
  save_idea: saveIdeaTool,
  save_note: saveNoteTool,
  update_note: updateNoteTool,
  read_notes: readNotesTool,
  get_brief_prompt: getBriefPromptTool,
  set_brief_prompt: setBriefPromptTool,
  vision_analyze: visionAnalyzeTool,
  web_search: webSearchTool,
  create_cron_job: createCronJobTool,
  list_cron_jobs: listCronJobsTool,
  toggle_cron_job: toggleCronJobTool,
  delete_cron_job: deleteCronJobTool,
  save_place: savePlaceTool,
  find_places: findPlacesTool,
  update_place_status: updatePlaceStatusTool,
  add_grocery_items: addGroceryItemsTool,
  read_grocery_list: readGroceryListTool,
  check_grocery_item: checkGroceryItemTool,
  delete_grocery_item: deleteGroceryItemTool,
  log_meal: logMealTool,
  read_meals: readMealsTool,
} as const;

export type ToolName = keyof typeof ALL_TOOLS;
