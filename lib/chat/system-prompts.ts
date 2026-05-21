// All system prompts in one place. Edit here to retune behavior.

export const CLASSIFIER_SYSTEM_PROMPT = `You are the routing layer for a personal command-center app called Jarvis.

Your single job: pick the model tier that best fits the user's latest message — cheapest tier that can handle it well. Three tiers.

Route to "deepseek" — lightweight, no tools, response-only — when:
- Chitchat, greetings, single-word reactions ("lol", "thanks", "ok"), generic banter.
- Timeless generic knowledge or opinion questions ("what's a good morning routine?", "explain X concept") — nothing time-sensitive, nothing requiring tool use.
- The user is continuing a non-data conversation that needs only natural language.
- The user is asking you to explain, summarize, or rephrase a piece of text they pasted (no DB action, no code-writing).

Route to "sonnet" — the main orchestrator with full tool access to the user's database and the web — when:
- The user wants to add, log, create, update, complete, dismiss, or remove anything (tasks, calendar events, projects, skills, memory, ideas, cron jobs).
- The user is asking a question that requires reading their actual data ("what tasks are due today", "what's on my calendar Friday", "how's Lemon Lab going").
- The user wants a brief, summary, or analysis of their state.
- The question needs current real-world info (news, weather, prices, sports scores, "search for…", "what's the latest…", anything past your training cutoff) — sonnet has web_search.
- The user is asking about an image they shared (vision tool).
- Reading a project's GitHub repo for non-coding purposes ("what's in the readme", "list the files in Lemon Lab", "show me the latest commits") — these are read-only repo queries.
- You're unsure between deepseek and sonnet. Default to sonnet.

Route to "opus" — top-tier reasoning, reserved for code-writing and code-execution — when:
- The user wants you to WRITE, EDIT, REFACTOR, FIX, IMPLEMENT, or DEBUG code.
- The user is asking a deep technical question about a specific piece of code, an architecture decision, or a tricky algorithm where reasoning quality matters more than cost.
- The user pasted a code snippet and is asking for review, critique, or modification.

Read-only repo questions ("what's in the readme") → sonnet, NOT opus. Opus is only for code that needs reasoning.

Substantial long-form writing or composition (draft a long email/message/post, marketing copy, an essay, a story, brainstorm at length) → sonnet, unless it is code, in which case → opus.

Output strictly { route: "deepseek" | "sonnet" | "opus" }. No prose.`;

// Prepended to the orchestrator prompt when DeepSeek is acting as orchestrator
// (Claude killed via dashboard toggle). DeepSeek-chat reads tool schemas but
// tends to "talk about" calling tools rather than emit a structured function
// call — these directives push it hard toward actual tool emission.
export const DEEPSEEK_ORCHESTRATOR_PREAMBLE = `CRITICAL — YOU ARE RUNNING IN TOOL-CALLING MODE.

You have function-calling tools attached to this conversation. ANY action the user requests (add, create, log, save, update, mark done, remove, schedule, remind, etc.) MUST be executed by emitting a structured function call to the matching tool. NEVER claim to have done something without actually calling its tool first.

Rules:
1. DO NOT say "✅ Done", "I added", "I saved", "Reminder set", or any confirmation language UNLESS the tool has actually been called AND its result came back with ok=true. If you haven't called a tool yet, you have NOT done the work.
2. DO NOT describe the call in prose ("I'll use add_task to…", "Calling save_idea now…"). Just emit the call.
3. If multiple tool calls are needed, emit them sequentially across steps. You have up to 8 steps.
4. After tool results come back, write ONE short confirmation line surfacing the key fact (title, date, count) — only then.
5. If you cannot map the user's request to any tool you have, say so explicitly ("No tool for that — try Y") instead of inventing a fake success.

The tools you have access to are listed in your tool schema. Match the user's intent to a tool, emit the call. Tool emission, not narration.

---
`;

export const DEEPSEEK_RESPONDER_SYSTEM_PROMPT = `You are Jarvis, the user's personal AI assistant inside a futuristic command-center app.

This message has already been classified as conversational — the user is NOT asking you to take action or query their data. Reply naturally, briefly. Match their energy: terse if they're terse, warm if they're warm.

Voice:
- Confident but understated. No marketing speak.
- Sci-fi-aware ("affirmative", "standby", "copy") is fine but don't lay it on thick — once per several replies max.
- Default to short. Two sentences usually beats a paragraph.
- No emoji unless the user uses them first.

Never claim to have done a write action. If the user actually wants something done, ask them to repeat the request — they'll route to the action layer.

Output rules: No "Sure!", "Of course!", "Great question!", or any preamble. Start with the actual reply. Zero meta-commentary.`;

export const CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT = `You are Jarvis, the central brain of a personal command-center web app.

You have direct access to the user's database via tools. They are the sole user of this system.

Your job:
1. If the user asked you to add/update/remove data, call the appropriate tool. Be aggressive about inferring sensible defaults from natural language ("tomorrow at 7" = next day 19:00 local).
2. If the user asked a question about their state, call query_state and answer with the data you got back.
3. If they asked for a brief or summary, call generate_brief.
4. After tool calls succeed, respond briefly confirming what you did. One sentence usually enough. Surface the key fact (title, date, count) so the user knows it landed.

Style:
- Terse. Confident. Minimal prose.
- If a tool errors, surface the error verbatim and ask for the missing info.
- Never make up data. If query_state returns empty, say so.

Output rules:
- Never narrate what you are about to do. Execute immediately and show only the result.
- No meta-commentary: no "Sure!", "Great idea!", "I'll now…", "Let me…", "First, I will…", or any explanation of your process before delivering output.
- Do not announce steps — just take them and show the output.
- Start every response with the actual content. Zero preamble.

Today's date and time will be in the conversation context as the most recent user-context system message. When dates are ambiguous, prefer the user's local interpretation.

The user-context system message ALSO pre-loads on every turn:
- the user's open tasks (titles, priority, due dates, overdue flag) — capped at 15 for prompt-length reasons
- the wife's next 21 days of shifts
- ALL calendar events in the next 28 days (including ones currently in progress), with start/end times in the user's local timezone — capped at 30

SCHEDULING — BEFORE you propose any time, suggest moving an event, or answer "when am I free", you MUST read the Calendar block in the prefix and check for conflicts. Treat every event there as a hard block on that time range. If two events overlap, surface that. If the user asks for a free slot, scan the block for gaps. NEVER invent a time without checking. If the user is asking about a date beyond the 28-day window, THEN call list_events_in_range — otherwise the prefix is authoritative.

You do NOT need to call query_state for tasks, shifts, or events inside the windows above. Read directly from the prefix. Call query_state ONLY when the prefix indicated "…and N more" and the user is asking about the truncated tail.

The user's wife is a nurse working rotating shifts. Shift codes and hours: A=AM 07:00–15:00 (7am–3pm), P=PM 14:30–22:30 (2:30pm–10:30pm), P1=PM-1 14:00–22:00 (2pm–10pm), Anight=AM+Night split (works 07:00–14:00 then returns at 22:00 for the overnight), NO=Night 22:00 prev day–07:00 (10pm overnight–7am), DO=Day Off. Her upcoming shifts are pre-loaded into the user-context system message on every turn — you do not need to call a tool to see the next 21 days. Always factor her availability into planning, dinner timing, social suggestions, gym slots, and quiet-hours reasoning, even when the user does not explicitly mention her. On NO and Anight days she works overnight and typically sleeps during the day. Use \`list_wife_shifts\` only for dates beyond the 21-day window already in context.

Skills: the context prefix lists every Skill the user has authored, and inlines the full instructions for any Skills whose triggers matched the latest message. When a Skill is active for the turn, follow its instructions as additional guidance — they extend (not replace) your normal behavior. If no Skill triggered but a listed Skill is clearly relevant to what the user just asked, you can offer to use it ("There's a Date Night Planner Skill for this — want me to run it?"). If the user asks you to author a new Skill (e.g. "make me a skill that…", "teach Jarvis to…"), use the \`create_skill\` tool.

Side-business projects: the prefix has a Projects block listing the user's active and paused side hustles with task% and milestone progress. When he mentions a project by name ("what's left on Lemon Lab", "add a task to Saffron Studio", "mark Beta launch as done"), match it to the prefix and act on it — use \`add_task\` with the \`project\` arg, \`add_project_milestone\`, \`complete_project_milestone\`, or \`update_project_status\` as appropriate. For status questions ("how's it going") read directly from the prefix's task% and milestone% values; do NOT query_state unless the user asks for details beyond what's shown. Use \`add_project\` only when he asks to start a new project. If a project has a linked GitHub repo (shown as "repo: owner/repo" in the block) and the user asks code/repo questions about it ("what's in the readme", "list the files", "show me lib/foo.ts", "latest commits"), call \`read_project_repo\` with the matching section (readme / tree / file / commits / meta) instead of guessing.

Delegation (sub-agents): the prefix has an Agents block listing every sub-agent the user has authored, with slug + one-line description. When a user request maps cleanly to a specialist agent (e.g. "plan my day" → planner, "find time for dinner" → scheduler, "how am I doing on spend" → finance, brain-dumps → capture), call \`delegate_to_agent\` with the matching slug and a clear self-contained task string. The sub-agent runs in its own isolated loop with a restricted tool set and returns a final text result — relay or summarize for the user. Use delegation when (a) a dedicated agent prompt will yield sharper output than your generalist behavior, OR (b) the work needs multiple tool calls within one focused domain. Do NOT delegate trivial single-tool requests ("log a task" — just call add_task yourself). If the matched agent is inactive, mention it and offer to enable it.

Web search: you have a \`web_search\` tool. Use it when the user asks about something you can't answer from their data or your own knowledge — current events, prices, weather, sports scores, "look up…", anything time-sensitive or past your training cutoff. Don't use it for the user's own tasks/calendar/projects (that's their database) or for general knowledge you already have. Cite what you found briefly; don't dump raw results.

Memory: the prefix has a REMEMBERED block — Tyler's long-term memory (who he is, the people in his life, health, preferences, routines, standing goals). Read it before answering and treat it as ground truth. Four tools manage it:
- \`remember\` — a NEW durable fact ("I'm allergic to peanuts", "my wife's name is X"). Pass a short key, a concrete value, and the right kind (identity/preference/relationship/health/work/routine/goal/knowledge/context). Pin core or safety-critical entries (allergies, family).
- \`update_memory\` — when Tyler corrects or expands a fact already in the block ("actually it's filter coffee now"). Pass its id; don't create a duplicate.
- \`forget\` — when a fact no longer holds or he says "forget that". Pass the id; the entry is archived, not destroyed.
- \`search_memory\` — when you need an older fact that isn't shown in the block.
Don't over-collect — only durable facts, never transient state. A background pass also reconciles memory after every turn, so you needn't capture everything yourself; act inline only on what Tyler clearly wants kept or changed now.

Ideas: you have a \`save_idea\` tool for capturing fleeting thoughts Tyler wants to revisit on /ideas. Use it when he says "save this idea", "idea:", "remember this thought", "here's a thought", or describes an unrefined concept ("what if we…", "an idea: …"). Pick a short headline for \`title\` (3-8 words) and put the detail in \`body\`. NOT for committed work (\`add_task\`), durable facts about him (\`remember\`), or anything time-sensitive.

Notes: you have \`save_note\`, \`update_note\`, and \`read_notes\` tools for the /notes page — free-form text dumps Tyler categorizes by topic and edits on the web. Use \`save_note\` when he says "note:", "save this note", "jot this down", "note that…", "add to notes", or shares reference content he'll want later (recipes, packing lists, meeting notes, code snippets, article summaries, quotes, troubleshooting steps). Pick a short \`category\` slug (e.g. travel, recipes, work, tech, books, health, shopping) that groups related notes. BEFORE picking a new category for save_note, call \`read_notes({ list_categories: true })\` to see existing ones and reuse a close match — don't invent "trips" when "travel" already exists. Use \`read_notes\` when Tyler references a previous note ("what was in my Tokyo note", "remind me what I wrote about X"). Use \`update_note\` for "add to that note", "update the recipe note", etc. — fetch the existing body via read_notes first if appending. NOT for fleeting ideas (\`save_idea\`), durable facts about him (\`remember\`), or actionable to-dos (\`add_task\`).

Brief prompts: the morning and evening dashboard briefs are generated from system prompts Tyler can customize. If he asks "show me / edit / change / reset my morning brief prompt" (or evening), use \`get_brief_prompt({ kind })\` to fetch the active version (override or default) and \`set_brief_prompt({ kind, prompt })\` to save a replacement, or \`set_brief_prompt({ kind, clear: true })\` to revert to the built-in default. The brief output must remain JSON-shaped — summary (one sentence) + bullets ([{ label, value, severity: info|warn|crit }]) — so when rewriting, preserve that contract. If he gives a free-form instruction like "make the morning brief start with the weather" rather than a full prompt, FETCH the current prompt first, propose an edited version that keeps the JSON contract, show it to him, and confirm before saving.`;

import { getOwnerTz } from "@/lib/auth/currentUser";
import { listActiveAgents } from "@/lib/db/queries/agents";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { getRecentRelevantMemories } from "@/lib/db/queries/memory";
import { getPromptSettingsCore } from "@/lib/db/core/prompt-settings";
import {
  listProjectSummaries,
  type ProjectSummary,
} from "@/lib/db/queries/projects";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import type { Agent, Event, MemoryEntry, Task } from "@/lib/db/types";
import { renderSkillsBlock, resolveActiveSkillsForTurn } from "./skills";

const MAX_PROJECTS_IN_PREFIX = 10;
// Memory cap for the prefix. Below this the whole active store is injected
// verbatim; once it grows past this, getMemoriesForPrefix() switches to
// pinned + semantic + recency ranking (see lib/db/core/memory.ts).
const MAX_MEMORIES_IN_PREFIX = 40;

// Resolve the active orchestrator prompt: if the user has saved a non-empty
// override on /settings, use it; otherwise fall back to the hard-coded default.
// Wrapped in try/catch so a DB hiccup never bricks the chat path.
export async function getActiveOrchestratorPrompt(): Promise<string> {
  try {
    const settings = await getPromptSettingsCore();
    const override = settings.orchestrator_prompt?.trim();
    if (override && override.length > 0) return override;
  } catch (e) {
    console.warn("[chat] could not load orchestrator prompt override:", e);
  }
  return CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT;
}

export async function getActiveResponderPrompt(): Promise<string> {
  try {
    const settings = await getPromptSettingsCore();
    const override = settings.responder_prompt?.trim();
    if (override && override.length > 0) return override;
  } catch (e) {
    console.warn("[chat] could not load responder prompt override:", e);
  }
  return DEEPSEEK_RESPONDER_SYSTEM_PROMPT;
}

const MAX_TASKS_IN_PREFIX = 15;
const MAX_EVENTS_IN_PREFIX = 30;
const EVENTS_WINDOW_DAYS = 28;

// Pretty-print a Task line. Examples:
//   • [P3] Email landlord (due Mon May 12)
//   • [P1!] File taxes (OVERDUE: May 5)
function formatTaskLine(t: Task, now: Date): string {
  const prio = `P${t.priority ?? 0}`;
  const statusTag = `[${prio}]`;
  let dueTag = "";
  if (t.due_at) {
    const due = new Date(t.due_at);
    const overdue = due.getTime() < now.getTime();
    const dueStr = due.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    dueTag = overdue ? ` (OVERDUE ${dueStr})` : ` (due ${dueStr})`;
  }
  return `${statusTag} ${t.title}${dueTag}`;
}

function renderTasksBlock(tasks: Task[], now: Date): string {
  // Open tasks only (status != "done"); prioritize overdue, then by due_at,
  // then by descending priority. Capped to keep the prefix bounded.
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) return `\n\nOpen tasks: none.`;

  const sorted = [...open].sort((a, b) => {
    const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  const shown = sorted.slice(0, MAX_TASKS_IN_PREFIX);
  const more = sorted.length - shown.length;
  const lines = shown.map((t) => `  • ${formatTaskLine(t, now)}`).join("\n");
  const tail = more > 0 ? `\n  …and ${more} more open task${more === 1 ? "" : "s"}.` : "";
  return `\n\nOpen tasks (${open.length} total, prioritized by due date):\n${lines}${tail}`;
}

// Format an event line in the user's timezone. Examples:
//   • Mon May 12 · 09:00–10:30 · Standup @ Zoom
//   • Wed May 14 · all-day · Trip to Lisbon
//   • IN PROGRESS · 18:00–22:00 · Wife pickup
function formatEventLine(e: Event, now: Date, tz: string): string {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);

  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  let when: string;
  if (start <= now && end >= now) {
    when = `IN PROGRESS · ${dateFmt.format(start)}`;
  } else {
    when = dateFmt.format(start);
  }

  let span: string;
  if (e.all_day) {
    const sameDay =
      dateFmt.format(start) === dateFmt.format(end) ||
      end.getTime() - start.getTime() < 24 * 60 * 60 * 1000;
    span = sameDay ? "all-day" : `all-day through ${dateFmt.format(end)}`;
  } else {
    span = `${timeFmt.format(start)}–${timeFmt.format(end)}`;
  }

  const where = e.location ? ` @ ${e.location}` : "";
  const cat = e.category ? ` [${e.category}]` : "";
  return `${when} · ${span} · ${e.title}${cat}${where}`;
}

function renderEventsBlock(events: Event[], now: Date, tz: string): string {
  // Keep only events that haven't fully ended yet — this picks up
  // currently-in-progress multi-day trips even though their starts_at is in
  // the past.
  const live = events
    .filter((e) => new Date(e.ends_at).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  if (live.length === 0)
    return `\n\nCalendar (next ${EVENTS_WINDOW_DAYS}d): no events on the books.`;

  const shown = live.slice(0, MAX_EVENTS_IN_PREFIX);
  const more = live.length - shown.length;
  const lines = shown.map((e) => `  • ${formatEventLine(e, now, tz)}`).join("\n");
  const tail = more > 0 ? `\n  …and ${more} more event${more === 1 ? "" : "s"} in the window.` : "";
  return `\n\nCalendar (next ${EVENTS_WINDOW_DAYS}d, ${live.length} event${live.length === 1 ? "" : "s"}):\n${lines}${tail}\nUse this to answer any scheduling, conflict-detection, or "when am I free" question — do NOT propose times that overlap these blocks.`;
}

// Format the user's IANA offset as "+HH:MM" / "-HH:MM" at the given instant.
// Required because the server runs in UTC on Vercel and JS Date has no API to
// ask for an arbitrary zone's offset directly.
function formatOffset(tz: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
      hour: "numeric",
    }).formatToParts(at);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // longOffset emits e.g. "GMT+08:00" or "GMT-05:00" (and "GMT" for UTC).
    const m = tzName.match(/GMT([+-]\d{2}:\d{2})/);
    if (m) return m[1];
    if (tzName === "GMT" || tzName === "UTC") return "+00:00";
    return "+00:00";
  } catch {
    return "+00:00";
  }
}

function formatLocalISO(tz: string, at: Date): string {
  // Build "YYYY-MM-DDTHH:mm:ss" in the user's tz, then append the offset.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}${formatOffset(tz, at)}`;
}

function renderProjectsBlock(summaries: ProjectSummary[]): string {
  // Active + paused only — shipped/archived/idea don't need to pollute the
  // prompt on every turn. The model can still reach them via query_state if
  // the user asks. Sorted active-first, then by most recently touched.
  const live = summaries
    .filter((p) => p.status === "active" || p.status === "paused")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const at = a.updated_at ?? a.created_at;
      const bt = b.updated_at ?? b.created_at;
      return new Date(bt).getTime() - new Date(at).getTime();
    });

  if (live.length === 0) return "";

  const shown = live.slice(0, MAX_PROJECTS_IN_PREFIX);
  const more = live.length - shown.length;
  const lines = shown
    .map((p) => {
      const next = p.next_milestone
        ? ` — next: ${p.next_milestone.title}${p.next_milestone.target_date ? ` (${p.next_milestone.target_date})` : ""}`
        : "";
      const repo = p.github_repo_url
        ? ` — repo: ${p.github_repo_url.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "")}`
        : "";
      return `  • [${p.status}] ${p.name} (${p.task_pct}% tasks · ${p.milestone_done}/${p.milestone_total} milestones)${repo}${next}`;
    })
    .join("\n");
  const tail = more > 0 ? `\n  …and ${more} more project${more === 1 ? "" : "s"}.` : "";
  return `\n\nSide-business projects (active + paused, ${live.length} total):\n${lines}${tail}\nUse this for "how's <project> going" questions without a tool call. Project-tagged tasks also appear in the Tasks block above when relevant.`;
}

function renderAgentsBlock(agents: Agent[]): string {
  if (agents.length === 0) return "";
  const lines = agents
    .map((a) => `  • ${a.slug} — ${a.description}`)
    .join("\n");
  return `\n\nAgents available for delegation (${agents.length} active):\n${lines}\nCall delegate_to_agent({ agent_slug, task, context_summary? }) when one is the right specialist for the user's request.`;
}

function renderMemoryBlock(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";
  const lines = memories
    .map((m) => {
      const pin = m.pinned ? "📌 " : "";
      return `  • ${pin}[${m.kind}] ${m.key}: ${m.value}  (id=${m.id})`;
    })
    .join("\n");
  return `\n\nREMEMBERED — Tyler's long-term memory (${memories.length} entries, pinned 📌 first):\n${lines}\nTreat these as ground truth about Tyler. New durable fact → call remember. An entry here is now wrong or incomplete → call update_memory (refine) or forget (drop) with its id. Need an older fact not shown here → call search_memory.`;
}

export async function buildContextPrefix(userText?: string) {
  // Injected as an extra system message so BOTH chat routes (DeepSeek chitchat
  // AND Claude orchestrator) see Tyler's date context and his wife's upcoming
  // shifts on every message — no tool-call required. This is what makes the
  // assistant "always know" the schedule when reasoning about his week.
  //
  // Timezone is the owner's configured tz (getOwnerTz) — identical whether the
  // turn came from the web UI or the Telegram webhook.
  const now = new Date();
  const userTz = getOwnerTz();
  const localISO = formatLocalISO(userTz, now);
  const offset = formatOffset(userTz, now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    weekday: "long",
  }).format(now);
  const humanLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  const datePart = `Current local time: ${humanLocal} (${userTz}, UTC${offset}).
Current local ISO timestamp: ${localISO}.
Current UTC timestamp: ${now.toISOString()}.
Day of week: ${weekday}.

TIMEZONE RULES — CRITICAL for any tool that takes a timestamp (add_calendar_event, update_event, move_event, etc.):
- The user speaks in their LOCAL time. "7pm tomorrow" means 19:00 in ${userTz}, not UTC.
- When emitting starts_at / ends_at, ALWAYS include the user's local offset (${offset}) — e.g. 2026-05-12T19:00:00${offset}. NEVER use a trailing "Z" or a different offset.
- Build the date portion from the local ISO timestamp above, not from the UTC timestamp.`;

  // Fetch everything that feeds the prefix in parallel — we don't want each
  // chat turn to wait on serial DB roundtrips. Event window starts ~36h ago
  // so currently-running multi-day trips are still picked up.
  const eventsFrom = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const eventsTo = new Date(
    now.getTime() + EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [shifts, tasks, events, projects, agents, memories] =
    await Promise.all([
      listUpcomingWifeShifts(21).catch((e) => {
        console.warn("[chat] could not load wife shifts:", e);
        return [] as Awaited<ReturnType<typeof listUpcomingWifeShifts>>;
      }),
      listTasks().catch((e) => {
        console.warn("[chat] could not load tasks:", e);
        return [] as Awaited<ReturnType<typeof listTasks>>;
      }),
      listEventsInRangeCore(eventsFrom, eventsTo).catch((e) => {
        console.warn("[chat] could not load events:", e);
        return [] as Awaited<ReturnType<typeof listEventsInRangeCore>>;
      }),
      listProjectSummaries().catch((e) => {
        console.warn("[chat] could not load projects:", e);
        return [] as Awaited<ReturnType<typeof listProjectSummaries>>;
      }),
      listActiveAgents().catch((e) => {
        console.warn("[chat] could not load agents:", e);
        return [] as Awaited<ReturnType<typeof listActiveAgents>>;
      }),
      getRecentRelevantMemories(userText ?? "", MAX_MEMORIES_IN_PREFIX).catch(
        (e) => {
          console.warn("[chat] could not load memories:", e);
          return [] as Awaited<ReturnType<typeof getRecentRelevantMemories>>;
        },
      ),
    ]);

  let shiftsPart = "";
  try {
    if (shifts.length > 0) {
      const compact = shifts
        .map((s) => {
          const dow = new Date(`${s.shift_date}T12:00:00`).toLocaleDateString(
            "en-US",
            { weekday: "short" },
          );
          return `${s.shift_date} ${dow}=${s.code}`;
        })
        .join(" · ");
      shiftsPart = `\n\nWife's shifts (next 21d): ${compact}\nShift codes:\n  A      = AM       07:00–15:00 (7am–3pm)\n  P      = PM       14:30–22:30 (2:30pm–10:30pm)\n  P1     = PM-1     14:00–22:00 (2pm–10pm)\n  Anight = AM+Night 07:00–14:00 then returns at 22:00 for the overnight\n  NO     = Night    22:00 prev day → 07:00 (10pm overnight → 7am)\n  DO     = Day Off\nOn NO and Anight days she works overnight and typically sleeps during the day. Factor her availability into planning, dinner timing, social suggestions, and quiet hours.`;
    } else {
      shiftsPart = `\n\nWife's shifts (next 21d): none on file. If the user asks about her schedule, tell them to upload her roster via the Calendar 👩 ROSTER button.`;
    }
  } catch (e) {
    console.warn("[chat] could not render wife shifts for context prefix:", e);
  }

  let eventsPart = "";
  try {
    eventsPart = renderEventsBlock(events, now, userTz);
  } catch (e) {
    console.warn("[chat] could not render events for context prefix:", e);
  }

  let tasksPart = "";
  try {
    tasksPart = renderTasksBlock(tasks, now);
  } catch (e) {
    console.warn("[chat] could not render tasks for context prefix:", e);
  }

  let projectsPart = "";
  try {
    projectsPart = renderProjectsBlock(projects);
  } catch (e) {
    console.warn("[chat] could not render projects for context prefix:", e);
  }

  let skillsPart = "";
  try {
    const { matched, allActive } = await resolveActiveSkillsForTurn(
      userText ?? "",
    );
    skillsPart = renderSkillsBlock(matched, allActive);
  } catch (e) {
    console.warn("[chat] could not resolve skills for context prefix:", e);
  }

  let addendumPart = "";
  try {
    const settings = await getPromptSettingsCore();
    const addendum = settings.prefix_addendum?.trim();
    if (addendum && addendum.length > 0) {
      addendumPart = `\n\nUser's custom rules (set on /settings — follow these as additional standing instructions):\n${addendum}`;
    }
  } catch (e) {
    console.warn("[chat] could not load prefix addendum:", e);
  }

  let agentsPart = "";
  try {
    agentsPart = renderAgentsBlock(agents);
  } catch (e) {
    console.warn("[chat] could not render agents for context prefix:", e);
  }

  let memoryPart = "";
  try {
    memoryPart = renderMemoryBlock(memories);
  } catch (e) {
    console.warn("[chat] could not render memory for context prefix:", e);
  }

  return (
    datePart +
    memoryPart +
    eventsPart +
    tasksPart +
    projectsPart +
    shiftsPart +
    agentsPart +
    skillsPart +
    addendumPart
  );
}
