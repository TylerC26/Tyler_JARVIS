import {
  addDays,
  differenceInDays,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import type {
  AIContext,
  AiBriefBullet,
  AiSeverity,
  SuggestionDraft,
} from "@/lib/ai/types";
import type { AIEngine } from "./types";

const MAX_BULLETS = 5;

function bullet(
  label: string,
  value: string,
  severity: AiSeverity = "info",
): AiBriefBullet {
  return { label, value, severity };
}

function clip<T>(arr: T[], n = MAX_BULLETS): T[] {
  return arr.slice(0, n);
}

// ---------- Morning ----------

function morningBullets(ctx: AIContext): AiBriefBullet[] {
  const out: AiBriefBullet[] = [];

  // P1/P2 due today
  const dueToday = ctx.tasks.today.filter((t) => t.priority <= 2);
  if (dueToday.length > 0) {
    const top = dueToday.sort((a, b) => a.priority - b.priority)[0]!;
    out.push(
      bullet(
        "PRIORITY TODAY",
        `P${top.priority} due today: ${top.title}${dueToday.length > 1 ? ` (+${dueToday.length - 1})` : ""}`,
        "crit",
      ),
    );
  }

  // Overdue count
  if (ctx.tasks.overdue.length > 0) {
    out.push(
      bullet(
        "OVERDUE",
        `${ctx.tasks.overdue.length} overdue task${ctx.tasks.overdue.length === 1 ? "" : "s"}`,
        "warn",
      ),
    );
  }

  // Upcoming priority load (P1/P2 due in the next 3 days)
  const today = parseISO(ctx.forDate);
  const horizon = addDays(startOfDay(today), 3);
  const soon = ctx.tasks.upcoming.filter((t) => {
    if (t.priority > 2 || !t.due_at) return false;
    const due = parseISO(t.due_at);
    return !isBefore(due, startOfDay(today)) && isBefore(due, horizon);
  });
  if (soon.length > 0) {
    out.push(
      bullet(
        "INCOMING",
        `${soon.length} priority task${soon.length === 1 ? "" : "s"} in next 3d`,
        "info",
      ),
    );
  }

  return clip(out);
}

function morningSummary(bullets: AiBriefBullet[], ctx: AIContext): string {
  if (bullets.length === 0) {
    return "Quiet morning. No signals on the task front.";
  }
  const day = format(parseISO(ctx.forDate), "EEEE");
  const openTasks = ctx.tasks.today.length + ctx.tasks.overdue.length;
  const crit = bullets.filter((b) => b.severity === "crit").length;
  const tone =
    crit > 0 ? "Heads up" : bullets.some((b) => b.severity === "warn") ? "On notice" : "Steady";
  return `${tone} for ${day}. ${openTasks} task${openTasks === 1 ? "" : "s"} on plate.`;
}

// ---------- Evening ----------

function eveningBullets(ctx: AIContext): AiBriefBullet[] {
  const out: AiBriefBullet[] = [];
  const today = parseISO(ctx.forDate);
  const tomorrow = addDays(today, 1);

  // Tasks shipped today
  const shipped = ctx.tasks.all.filter(
    (t) =>
      t.completed_at &&
      isSameDay(parseISO(t.completed_at), today),
  );
  if (shipped.length > 0) {
    out.push(
      bullet(
        "SHIPPED",
        `${shipped.length} task${shipped.length === 1 ? "" : "s"} closed today`,
        "info",
      ),
    );
  }

  // Tomorrow's load
  const tomorrowsLoad = ctx.tasks.all.filter(
    (t) =>
      t.status !== "done" &&
      t.priority <= 2 &&
      t.due_at &&
      isSameDay(parseISO(t.due_at), tomorrow),
  );
  if (tomorrowsLoad.length > 0) {
    out.push(
      bullet(
        "TOMORROW",
        `${tomorrowsLoad.length} priority item${tomorrowsLoad.length === 1 ? "" : "s"} due tomorrow`,
        tomorrowsLoad.length >= 3 ? "warn" : "info",
      ),
    );
  }

  // Standing overdue
  if (ctx.tasks.overdue.length > 0) {
    out.push(
      bullet(
        "OVERDUE",
        `${ctx.tasks.overdue.length} overdue still open`,
        "warn",
      ),
    );
  }

  return clip(out);
}

function eveningSummary(bullets: AiBriefBullet[], ctx: AIContext): string {
  if (bullets.length === 0) {
    return "Quiet evening. Nothing logged, nothing closed.";
  }
  const day = format(parseISO(ctx.forDate), "EEEE");
  const shippedCount = ctx.tasks.all.filter(
    (t) =>
      t.completed_at &&
      isSameDay(parseISO(t.completed_at), parseISO(ctx.forDate)),
  ).length;
  const tone = shippedCount >= 3 ? "Shipped day" : shippedCount >= 1 ? "Forward motion" : "Reflective close";
  return `${tone}. ${day} review: ${shippedCount} shipped.`;
}

// ---------- Suggestions ----------

function productivitySuggestions(ctx: AIContext): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const today = parseISO(ctx.forDate);

  // 1. Stale doing task
  const stale = ctx.tasks.all.filter((t) => {
    if (t.status !== "doing") return false;
    const updated = parseISO(t.updated_at ?? t.created_at);
    return differenceInDays(today, updated) > 3;
  });
  if (stale.length > 0) {
    const t = stale.sort(
      (a, b) =>
        differenceInDays(today, parseISO(b.updated_at ?? b.created_at)) -
        differenceInDays(today, parseISO(a.updated_at ?? a.created_at)),
    )[0]!;
    const days = differenceInDays(
      today,
      parseISO(t.updated_at ?? t.created_at),
    );
    out.push({
      kind: "productivity",
      title: `Move or split: ${t.title}`,
      body: `In progress for ${days}d with no update. Either break it down or push it back to todo.`,
      severity: days > 7 ? "warn" : "info",
      evidence: { task_id: t.id, days_stale: days },
    });
  }

  // 2. P1 inflation
  const openP1 = ctx.tasks.all.filter(
    (t) => t.status !== "done" && t.priority === 1,
  );
  if (openP1.length > 5) {
    out.push({
      kind: "productivity",
      title: `P1 inflation: ${openP1.length} open critical tasks`,
      body: "When everything is P1, nothing is. Re-rank — promote at most three.",
      severity: "warn",
      evidence: { count: openP1.length, ids: openP1.map((t) => t.id) },
    });
  }

  // 3. Long-overdue with no movement
  const stuck = ctx.tasks.overdue.filter((t) => {
    const updated = parseISO(t.updated_at ?? t.created_at);
    return differenceInDays(today, updated) > 2;
  });
  if (stuck.length > 0) {
    const t = stuck[0]!;
    out.push({
      kind: "productivity",
      title: `Archive or reschedule: ${t.title}`,
      body: `Overdue and untouched for >2d. Decide: matter, or kill.`,
      severity: "info",
      evidence: { task_id: t.id, due_at: t.due_at },
    });
  }

  return out;
}

// ---------- Engine ----------

export const placeholderEngine: AIEngine = {
  name: "placeholder-v1",

  async generateMorning(ctx) {
    const bullets = morningBullets(ctx);
    return { summary: morningSummary(bullets, ctx), bullets };
  },

  async generateEvening(ctx) {
    const bullets = eveningBullets(ctx);
    return { summary: eveningSummary(bullets, ctx), bullets };
  },

  async generateSuggestions(ctx) {
    return productivitySuggestions(ctx);
  },
};
