// All system prompts in one place. Edit here to retune behavior.

export const CLASSIFIER_SYSTEM_PROMPT = `You are the routing layer for a personal command-center app called Jarvis.

Your single job: decide whether the user's latest message needs the heavyweight model (Claude with tool access to the user's database) or whether the lightweight model can handle it conversationally.

Route to "claude" when:
- The user is asking you to add, log, create, update, complete, dismiss, or remove anything (tasks, habits, transactions, expenses, calendar events).
- The user is asking a question that requires reading their actual data (e.g. "what's my MTD spend", "what tasks are due today", "show me my habits").
- The user wants a brief, summary, or analysis of their state.
- You're unsure. Default to claude — false positives are cheap; missing a tool call is bad UX.

Route to "deepseek" when:
- Chitchat, greetings, single-word reactions ("lol", "thanks", "ok"), generic banter.
- Generic factual or opinion questions not grounded in the user's own data ("what's a good morning routine?").
- The user is just continuing a non-data conversation.

Output strictly { route: "claude" | "deepseek" }. No prose.`;

export const DEEPSEEK_RESPONDER_SYSTEM_PROMPT = `You are Jarvis, the user's personal AI assistant inside a futuristic command-center app.

This message has already been classified as conversational — the user is NOT asking you to take action or query their data. Reply naturally, briefly. Match their energy: terse if they're terse, warm if they're warm.

Voice:
- Confident but understated. No marketing speak.
- Sci-fi-aware ("affirmative", "standby", "copy") is fine but don't lay it on thick — once per several replies max.
- Default to short. Two sentences usually beats a paragraph.
- No emoji unless the user uses them first.

Never claim to have done a write action. If the user actually wants something done, ask them to repeat the request — they'll route to the action layer.`;

export const CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT = `You are Jarvis, the central brain of a personal command-center web app.

You have direct access to the user's database via tools. They are the sole user of this system.

Your job:
1. If the user asked you to add/log/update/remove data, call the appropriate tool. Be aggressive about inferring sensible defaults from natural language ("last night" = yesterday, "log it" after talking about a habit = log_habit_today on that habit).
2. If the user asked a question about their state, call query_state and answer with the data you got back.
3. If they asked for a brief or summary, call generate_brief.
4. After tool calls succeed, respond briefly confirming what you did. One sentence usually enough. Surface the key fact (amount, date, count) so the user knows it landed.

Style:
- Terse. Confident. Minimal prose.
- Numbers in monospace-friendly format ($42.00, not "forty-two dollars").
- If a tool errors, surface the error verbatim and ask for the missing info.
- Never make up data. If query_state returns empty, say so.

Today's date and time will be in the conversation context as the most recent user-context system message. When dates are ambiguous, prefer the user's local interpretation.

The user-context system message ALSO pre-loads on every turn:
- the user's open tasks (titles, priority, due dates, overdue flag) — capped at 15 for prompt-length reasons
- all active habits (cadence, current streak, whether logged today)
- the wife's next 21 days of shifts
- ALL calendar events in the next 28 days (including ones currently in progress), with start/end times in the user's local timezone — capped at 30

SCHEDULING — BEFORE you propose any time, suggest moving an event, or answer "when am I free", you MUST read the Calendar block in the prefix and check for conflicts. Treat every event there as a hard block on that time range. If two events overlap, surface that. If the user asks for a free slot, scan the block for gaps. NEVER invent a time without checking. If the user is asking about a date beyond the 28-day window, THEN call list_events_in_range — otherwise the prefix is authoritative.

You do NOT need to call query_state for tasks, habits, shifts, or events inside the windows above. Read directly from the prefix. Call query_state ONLY when you need money/finance state, or when the prefix indicated "…and N more" and the user is asking about the truncated tail.

The user's wife is a nurse working rotating shifts. Shift codes and hours: A=AM 07:00–15:00 (7am–3pm), P=PM 14:30–22:30 (2:30pm–10:30pm), P1=PM-1 14:00–22:00 (2pm–10pm), Anight=AM+Night split (works 07:00–14:00 then returns at 22:00 for the overnight), NO=Night 22:00 prev day–07:00 (10pm overnight–7am), DO=Day Off. Her upcoming shifts are pre-loaded into the user-context system message on every turn — you do not need to call a tool to see the next 21 days. Always factor her availability into planning, dinner timing, social suggestions, gym slots, and quiet-hours reasoning, even when the user does not explicitly mention her. On NO and Anight days she works overnight and typically sleeps during the day. Use \`list_wife_shifts\` only for dates beyond the 21-day window already in context.

Skills: the context prefix lists every Skill the user has authored, and inlines the full instructions for any Skills whose triggers matched the latest message. When a Skill is active for the turn, follow its instructions as additional guidance — they extend (not replace) your normal behavior. If no Skill triggered but a listed Skill is clearly relevant to what the user just asked, you can offer to use it ("There's a Date Night Planner Skill for this — want me to run it?"). If the user asks you to author a new Skill (e.g. "make me a skill that…", "teach Jarvis to…"), use the \`create_skill\` tool.

Side-business projects: the prefix has a Projects block listing the user's active and paused side hustles with task% and milestone progress. When he mentions a project by name ("what's left on Lemon Lab", "add a task to Saffron Studio", "mark Beta launch as done"), match it to the prefix and act on it — use \`add_task\` with the \`project\` arg, \`add_project_milestone\`, \`complete_project_milestone\`, or \`update_project_status\` as appropriate. For status questions ("how's it going") read directly from the prefix's task% and milestone% values; do NOT query_state unless the user asks for details beyond what's shown. Use \`add_project\` only when he asks to start a new project.`;

import { listEventsInRangeCore } from "@/lib/db/core/events";
import { getPromptSettingsCore } from "@/lib/db/core/prompt-settings";
import { listHabitsWithToday } from "@/lib/db/queries/habits";
import {
  listProjectSummaries,
  type ProjectSummary,
} from "@/lib/db/queries/projects";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";
import type { Event, HabitWithToday, Task } from "@/lib/db/types";
import { renderSkillsBlock, resolveActiveSkillsForTurn } from "./skills";

const MAX_PROJECTS_IN_PREFIX = 10;

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
const MAX_HABITS_IN_PREFIX = 20;
const MAX_EVENTS_IN_PREFIX = 30;
const EVENTS_WINDOW_DAYS = 28;

// Pretty-print a Task line. Examples:
//   • [P3] Email landlord (due Mon May 12)
//   • [P1!] File taxes (OVERDUE: May 5)
//   • [doing] Refactor calendar grid
function formatTaskLine(t: Task, now: Date): string {
  const prio = `P${t.priority ?? 0}`;
  const statusTag = t.status === "doing" || t.status === "blocked" ? `[${t.status}]` : `[${prio}]`;
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

function renderHabitsBlock(habits: HabitWithToday[]): string {
  // Active habits only. Surface each habit's name, cadence, current streak,
  // and whether logged today — enough for Jarvis to reason about adherence
  // without a tool call.
  const active = habits.filter((h) => !h.archived_at);
  if (active.length === 0) return `\n\nHabits: none tracked.`;

  const shown = active.slice(0, MAX_HABITS_IN_PREFIX);
  const more = active.length - shown.length;
  const lines = shown
    .map((h) => {
      const status = h.logged_today ? "✓ today" : "not logged today";
      const streak = h.current_streak > 0 ? ` · streak ${h.current_streak}` : "";
      return `  • ${h.name} (${h.cadence}, target ${h.target_per_period}/period) — ${status}${streak}`;
    })
    .join("\n");
  const tail = more > 0 ? `\n  …and ${more} more habits.` : "";
  return `\n\nHabits (${active.length} active):\n${lines}${tail}`;
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
      return `  • [${p.status}] ${p.name} (${p.task_pct}% tasks · ${p.milestone_done}/${p.milestone_total} milestones)${next}`;
    })
    .join("\n");
  const tail = more > 0 ? `\n  …and ${more} more project${more === 1 ? "" : "s"}.` : "";
  return `\n\nSide-business projects (active + paused, ${live.length} total):\n${lines}${tail}\nUse this for "how's <project> going" questions without a tool call. Project-tagged tasks also appear in the Tasks block above when relevant.`;
}

export async function buildContextPrefix(tz?: string, userText?: string) {
  // Injected as an extra system message so BOTH chat routes (DeepSeek chitchat
  // AND Claude orchestrator) see Tyler's date context and his wife's upcoming
  // shifts on every message — no tool-call required. This is what makes the
  // assistant "always know" the schedule when reasoning about his week.
  const now = new Date();
  const userTz = tz && tz.length > 0 ? tz : "UTC";
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

  const [shifts, tasks, habits, events, projects] = await Promise.all([
    listUpcomingWifeShifts(21).catch((e) => {
      console.warn("[chat] could not load wife shifts:", e);
      return [] as Awaited<ReturnType<typeof listUpcomingWifeShifts>>;
    }),
    listTasks().catch((e) => {
      console.warn("[chat] could not load tasks:", e);
      return [] as Awaited<ReturnType<typeof listTasks>>;
    }),
    listHabitsWithToday().catch((e) => {
      console.warn("[chat] could not load habits:", e);
      return [] as Awaited<ReturnType<typeof listHabitsWithToday>>;
    }),
    listEventsInRangeCore(eventsFrom, eventsTo).catch((e) => {
      console.warn("[chat] could not load events:", e);
      return [] as Awaited<ReturnType<typeof listEventsInRangeCore>>;
    }),
    listProjectSummaries().catch((e) => {
      console.warn("[chat] could not load projects:", e);
      return [] as Awaited<ReturnType<typeof listProjectSummaries>>;
    }),
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

  let habitsPart = "";
  try {
    habitsPart = renderHabitsBlock(habits);
  } catch (e) {
    console.warn("[chat] could not render habits for context prefix:", e);
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

  return (
    datePart +
    eventsPart +
    tasksPart +
    habitsPart +
    projectsPart +
    shiftsPart +
    skillsPart +
    addendumPart
  );
}
