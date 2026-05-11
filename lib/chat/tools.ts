import { tool } from "ai";
import { z } from "zod";
import { runBrief } from "@/lib/ai/run";
import { fmtCurrency, fmtDate } from "@/lib/date";
import {
  archiveHabitCore,
  createHabitCore,
  logHabitTodayCore,
} from "@/lib/db/core/habits";
import {
  createAccountCore,
  createFixedExpenseCore,
  createTransactionCore,
} from "@/lib/db/core/money";
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
import { createSkillCore } from "@/lib/db/core/skills";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { listHabitsWithToday } from "@/lib/db/queries/habits";
import { listActiveSkills } from "@/lib/db/queries/skills";
import {
  listAccounts,
  listFixedExpenses,
  listTransactions,
  monthToDateSpend,
} from "@/lib/db/queries/money";
import { listTasks } from "@/lib/db/queries/tasks";
import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";

// ---------- task tools ----------

export const addTaskTool = tool({
  description:
    "Create a new task in the user's todo. Use for any 'add task', 'remind me to', 'todo', 'I need to' style request.",
  inputSchema: z.object({
    title: z.string().describe("Short imperative title of the task."),
    description: z.string().optional(),
    status: z.enum(["todo", "doing", "blocked", "done"]).optional(),
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
  }),
  execute: async (input) => {
    const result = await createTaskCore({
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      priority: input.priority ?? 3,
      due_at: input.due_at ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Task added: "${result.data.title}"`,
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

// ---------- habit tools ----------

export const addHabitTool = tool({
  description: "Create a new tracked habit.",
  inputSchema: z.object({
    name: z.string(),
    cadence: z.enum(["daily", "weekly"]).optional(),
    color: z.string().optional(),
  }),
  execute: async (input) => {
    const result = await createHabitCore({
      name: input.name,
      cadence: input.cadence ?? "daily",
      color: input.color ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Habit added: ${result.data.name} (${result.data.cadence})`,
      habit: result.data,
    };
  },
});

export const logHabitTodayTool = tool({
  description:
    "Toggle today's log for a habit by name (case-insensitive) or id. Inserts a log if one doesn't exist for today, otherwise removes it.",
  inputSchema: z.object({
    habit_name_or_id: z.string(),
  }),
  execute: async ({ habit_name_or_id }) => {
    const result = await logHabitTodayCore(habit_name_or_id);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: result.data.logged
        ? `Logged for today: ${result.data.habit.name}`
        : `Un-logged for today: ${result.data.habit.name}`,
      logged: result.data.logged,
      habit: result.data.habit,
    };
  },
});

export const archiveHabitTool = tool({
  description: "Archive a habit so it stops appearing in active lists.",
  inputSchema: z.object({ habit_id: z.string() }),
  execute: async ({ habit_id }) => {
    const result = await archiveHabitCore(habit_id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: "Habit archived." };
  },
});

// ---------- money tools ----------

export const addAccountTool = tool({
  description:
    "Create a financial account (chequing/savings/credit/investment/cash).",
  inputSchema: z.object({
    name: z.string(),
    type: z.enum(["checking", "savings", "credit", "investment", "cash"]),
    currency: z.string().optional(),
    current_balance: z.number().optional(),
  }),
  execute: async (input) => {
    const result = await createAccountCore(input);
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Account added: ${result.data.name} (${result.data.type})`,
      account: result.data,
    };
  },
});

export const addTransactionTool = tool({
  description:
    "Log a financial transaction. Account match is by name (case-insensitive) — if the user just says 'debit' you may pass 'debit' or 'chequing' as account_name_or_id and the system will resolve. If no match, you'll get an error and should ask the user.",
  inputSchema: z.object({
    account_name_or_id: z.string(),
    amount: z.number().positive(),
    direction: z.enum(["in", "out"]).describe("'out' = expense, 'in' = income"),
    occurred_on: z
      .string()
      .optional()
      .describe("YYYY-MM-DD. Defaults to today."),
    merchant: z.string().optional(),
    note: z.string().optional(),
    category_name: z
      .string()
      .optional()
      .describe(
        "Category name. Will be created if not present (e.g. 'Dining', 'Groceries', 'Transport').",
      ),
  }),
  execute: async (input) => {
    const result = await createTransactionCore({
      account_name_or_id: input.account_name_or_id,
      amount: input.amount,
      direction: input.direction,
      occurred_on: input.occurred_on,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      category_name: input.category_name ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const { transaction, account, category } = result.data;
    const sign = transaction.direction === "out" ? "-" : "+";
    return {
      ok: true,
      message: `Transaction added · ${transaction.merchant ?? "no merchant"} · ${sign}${fmtCurrency(Number(transaction.amount))} · ${fmtDate(transaction.occurred_on)} · ${account.name}${category ? ` · ${category.name}` : ""}`,
      transaction,
      account_name: account.name,
      category_name: category?.name ?? null,
    };
  },
});

export const addFixedExpenseTool = tool({
  description: "Schedule a recurring fixed expense.",
  inputSchema: z.object({
    name: z.string(),
    amount: z.number().positive(),
    cadence: z.enum(["monthly", "weekly", "yearly"]),
    day_of_period: z
      .number()
      .int()
      .describe(
        "Day-of-month (1-31) for monthly, day-of-week (0=Sun..6=Sat) for weekly, day-of-year for yearly.",
      ),
    account_name: z.string().optional(),
  }),
  execute: async (input) => {
    const result = await createFixedExpenseCore({
      name: input.name,
      amount: input.amount,
      cadence: input.cadence,
      day_of_period: input.day_of_period,
      account_name_or_id: input.account_name ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      message: `Fixed expense scheduled: ${result.data.name} ${fmtCurrency(Number(result.data.amount))} (${result.data.cadence})`,
      fixed_expense: result.data,
    };
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
      .enum(["tasks", "habits", "money", "events", "wife_shifts", "skills", "all"])
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
        next_5_open: tasks
          .filter((t) => t.status !== "done")
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            due_at: t.due_at,
          })),
      };
    }

    if (domain === "habits" || domain === "all") {
      const habits = await listHabitsWithToday();
      out.habits = {
        total: habits.length,
        logged_today: habits.filter((h) => h.logged_today).length,
        items: habits.map((h) => ({
          id: h.id,
          name: h.name,
          cadence: h.cadence,
          current_streak: h.current_streak,
          logged_today: h.logged_today,
        })),
      };
    }

    if (domain === "money" || domain === "all") {
      const [accounts, transactions, fixedExpenses, mtd] = await Promise.all([
        listAccounts(),
        listTransactions({ limit: 20 }),
        listFixedExpenses(),
        monthToDateSpend(),
      ]);
      out.money = {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: Number(a.current_balance),
        })),
        mtd_spend: mtd,
        recent_transactions: transactions.slice(0, 10).map((t) => ({
          occurred_on: t.occurred_on,
          merchant: t.merchant,
          amount: Number(t.amount),
          direction: t.direction,
          category: t.category_name,
          account: t.account_name,
        })),
        upcoming_fixed: fixedExpenses.slice(0, 5).map((e) => ({
          name: e.name,
          amount: Number(e.amount),
          next_occurs_on: e.next_occurs_on,
          account: e.account_name,
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

    return { ok: true, snapshot: out };
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

// ---------- registry ----------

export const ALL_TOOLS = {
  add_task: addTaskTool,
  complete_task: completeTaskTool,
  delete_task: deleteTaskTool,
  add_habit: addHabitTool,
  log_habit_today: logHabitTodayTool,
  archive_habit: archiveHabitTool,
  add_account: addAccountTool,
  add_transaction: addTransactionTool,
  add_fixed_expense: addFixedExpenseTool,
  add_calendar_event: addCalendarEventTool,
  update_event: updateEventTool,
  move_event: moveEventTool,
  delete_event: deleteEventTool,
  list_events_in_range: listEventsInRangeTool,
  list_wife_shifts: listWifeShiftsTool,
  create_skill: createSkillTool,
  query_state: queryStateTool,
  generate_brief: generateBriefTool,
} as const;

export type ToolName = keyof typeof ALL_TOOLS;
