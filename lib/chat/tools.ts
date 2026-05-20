import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { runBrief } from "@/lib/ai/run";
import { fmtDate } from "@/lib/date";
import { getAgentBySlug } from "@/lib/db/queries/agents";
import { createIdeaCore } from "@/lib/db/core/ideas";
import { createMemoryCore, deleteMemoryCore } from "@/lib/db/core/memory";
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
import { listProjectSummaries } from "@/lib/db/queries/projects";
import { listActiveSkills } from "@/lib/db/queries/skills";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import { webSearch } from "@/lib/web-search/openrouter";

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
    "Delegate a focused task to a sub-agent (Daily Planner, Scheduler, Finance Analyst, Quick Capture, or any custom agent the user has authored). Use this for specialized work where a dedicated prompt + tool subset will produce a sharper result than handling it inline. The agent runs in an isolated reasoning loop with only its allowlisted tools and returns a final text result that you should relay or summarize for the user. List of available agents lives at /agents — slugs are short kebab-case.",
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
      result: result.text,
      tool_calls_count: calls,
      tool_calls: result.tool_calls.map((c) => c.name),
    };
  },
});

// ---------- memory tools ----------

export const rememberTool = tool({
  description:
    "Persist a fact about Tyler so you can recall it in future conversations. Use this when the user says things like 'remember that…', 'note that I prefer…', 'just so you know…', or reveals a durable preference / fact (food allergies, preferred working hours, family details). The fact will be injected into your system prefix on every future chat turn. Keep the `key` short (3-6 words) and the `value` concrete and specific. Don't store transient state (today's task list, current mood).",
  inputSchema: z.object({
    key: z
      .string()
      .describe(
        "Short label for the fact, like a dictionary key. Examples: 'coffee preference', 'wife job', 'allergic to'.",
      ),
    value: z
      .string()
      .describe("The fact itself, written as a clear declarative statement."),
    kind: z
      .enum(["fact", "preference", "context"])
      .describe(
        "'fact' = objective truth; 'preference' = how the user likes things; 'context' = situational background.",
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
    "Delete a stored memory by id. Use when the user says 'forget that', 'remove that note', or contradicts a previously-saved fact. The memory_id is visible in the REMEMBERED section of your system prefix.",
  inputSchema: z.object({
    memory_id: z.string().describe("The id of the memory entry to delete."),
  }),
  execute: async ({ memory_id }) => {
    const result = await deleteMemoryCore(memory_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Memory forgotten." };
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
    "Search the live web via OpenRouter's web plugin and return a synthesized answer with source citations. Use for any question whose answer depends on real-world facts that change over time: flight schedules and prices, hotel availability, news, weather, sports scores, current product specs, visa rules, exchange rates, store hours, who-just-won-X, what-just-happened. Do NOT use for things in the user's own data (tasks/events/projects — use query_state) or for code questions (use read_project_repo). Quote prices/dates exactly as the answer reports them; never round or paraphrase numbers.",
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
        "How many web hits OpenRouter should scrape and feed into the answer. Defaults to 5. Bump to 8-10 for broad research questions, drop to 2-3 for tightly-scoped fact lookups.",
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
} as const;

export type ToolName = keyof typeof ALL_TOOLS;
