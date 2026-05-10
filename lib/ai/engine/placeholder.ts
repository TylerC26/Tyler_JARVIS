import {
  addDays,
  differenceInCalendarDays,
  differenceInDays,
  endOfMonth,
  format,
  getDate,
  getDaysInMonth,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { fmtCurrency, fmtDate } from "@/lib/date";
import type {
  AIContext,
  AiBriefBullet,
  AiSeverity,
  BriefDraft,
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

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

function clip<T>(arr: T[], n = MAX_BULLETS): T[] {
  return arr.slice(0, n);
}

// ---------- Morning ----------

function morningBullets(ctx: AIContext): AiBriefBullet[] {
  const out: AiBriefBullet[] = [];
  const today = parseISO(ctx.forDate);

  // 1. Streaks at risk
  const atRisk = ctx.habits.filter(
    (h) => h.current_streak >= 3 && !h.logged_today,
  );
  if (atRisk.length > 0) {
    const top = atRisk.sort((a, b) => b.current_streak - a.current_streak)[0]!;
    const sev: AiSeverity = top.current_streak >= 7 ? "warn" : "info";
    const extra = atRisk.length > 1 ? ` (+${atRisk.length - 1} more)` : "";
    out.push(
      bullet(
        "STREAK AT RISK",
        `${top.current_streak}d streak at risk: ${top.name}${extra}`,
        sev,
      ),
    );
  }

  // 2. P1/P2 due today
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

  // 3. Overdue count
  if (ctx.tasks.overdue.length > 0) {
    out.push(
      bullet(
        "OVERDUE",
        `${ctx.tasks.overdue.length} overdue task${ctx.tasks.overdue.length === 1 ? "" : "s"}`,
        "warn",
      ),
    );
  }

  // 4. Fixed expense in next 3 days
  const horizon = addDays(startOfDay(today), 3);
  const upcomingFixed = ctx.money.fixedExpensesUpcoming.filter((e) => {
    const next = parseISO(e.next_occurs_on);
    return !isBefore(next, startOfDay(today)) && isBefore(next, horizon);
  });
  if (upcomingFixed.length > 0) {
    const e = upcomingFixed[0]!;
    out.push(
      bullet(
        "FIXED EXPENSE",
        `${e.name} (${fmtCurrency(Number(e.amount))}) on ${fmtDate(e.next_occurs_on)}${upcomingFixed.length > 1 ? ` (+${upcomingFixed.length - 1})` : ""}`,
        "info",
      ),
    );
  }

  // 5. MTD pace vs trailing-30 daily average
  const dayOfMonth = getDate(today);
  const mtdDailyAvg = ctx.money.mtdSpend / Math.max(dayOfMonth, 1);

  const trailingStart = subDays(startOfDay(today), 30);
  const trailingTxs = ctx.money.recentTransactions.filter(
    (t) =>
      t.direction === "out" &&
      !isBefore(parseISO(t.occurred_on), trailingStart),
  );
  const trailingTotal = trailingTxs.reduce(
    (s, t) => s + Number(t.amount),
    0,
  );
  const trailingDailyAvg = trailingTotal / 30;

  if (trailingDailyAvg > 0 && ctx.money.mtdSpend > 0) {
    const ratio = mtdDailyAvg / trailingDailyAvg;
    if (ratio > 1.3) {
      const pct = Math.round((ratio - 1) * 100);
      const sev: AiSeverity = ratio > 1.6 ? "crit" : "warn";
      out.push(
        bullet(
          "MTD PACE",
          `MTD ${fmtCurrency(ctx.money.mtdSpend)} — ${pct}% above trailing pace`,
          sev,
        ),
      );
    }
  }

  return clip(out);
}

function morningSummary(bullets: AiBriefBullet[], ctx: AIContext): string {
  if (bullets.length === 0) {
    return "Quiet morning. No signals across habits, tasks, or spend.";
  }
  const day = format(parseISO(ctx.forDate), "EEEE");
  const habitDoneToday = ctx.habits.filter((h) => h.logged_today).length;
  const habitTotal = ctx.habits.length;
  const openTasks = ctx.tasks.today.length + ctx.tasks.overdue.length;
  const crit = bullets.filter((b) => b.severity === "crit").length;
  const tone =
    crit > 0 ? "Heads up" : bullets.some((b) => b.severity === "warn") ? "On notice" : "Steady";
  return `${tone} for ${day}. ${habitTotal > 0 ? `${habitDoneToday}/${habitTotal} habits` : "No habits tracked"} · ${openTasks} task${openTasks === 1 ? "" : "s"} on plate.`;
}

// ---------- Evening ----------

function eveningBullets(ctx: AIContext): AiBriefBullet[] {
  const out: AiBriefBullet[] = [];
  const today = parseISO(ctx.forDate);
  const tomorrow = addDays(today, 1);

  // 1. Habit completion
  if (ctx.habits.length > 0) {
    const done = ctx.habits.filter((h) => h.logged_today).length;
    const total = ctx.habits.length;
    const sev: AiSeverity =
      done === 0 ? "crit" : done < total / 2 ? "warn" : "info";
    out.push(
      bullet(
        "HABITS",
        `${done}/${total} logged today`,
        sev,
      ),
    );
  }

  // 2. Tasks shipped
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

  // 3. Today's spend
  const todaysOut = ctx.money.recentTransactions.filter(
    (t) =>
      t.direction === "out" &&
      isSameDay(parseISO(t.occurred_on), today),
  );
  if (todaysOut.length > 0) {
    const total = todaysOut.reduce((s, t) => s + Number(t.amount), 0);
    const dailyAmounts = ctx.money.recentTransactions
      .filter((t) => t.direction === "out")
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.occurred_on] = (acc[t.occurred_on] ?? 0) + Number(t.amount);
        return acc;
      }, {});
    const med = median(Object.values(dailyAmounts));
    const sev: AiSeverity = med > 0 && total > med * 2 ? "warn" : "info";
    out.push(
      bullet(
        "SPEND TODAY",
        `${fmtCurrency(total)} across ${todaysOut.length} txn${todaysOut.length === 1 ? "" : "s"}`,
        sev,
      ),
    );
  }

  // 4. Tomorrow's load
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

  // 5. Streak survival
  if (ctx.habits.length > 0) {
    const alive = ctx.habits.filter((h) => h.current_streak >= 1).length;
    out.push(
      bullet(
        "STREAKS",
        `${alive}/${ctx.habits.length} streaks alive`,
        "info",
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
  const habitDone = ctx.habits.filter((h) => h.logged_today).length;
  const tone = shippedCount >= 3 ? "Shipped day" : shippedCount >= 1 ? "Forward motion" : "Reflective close";
  return `${tone}. ${day} review: ${shippedCount} shipped, ${habitDone} habit${habitDone === 1 ? "" : "s"} logged.`;
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

function spendingSuggestions(ctx: AIContext): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const today = parseISO(ctx.forDate);
  const sevenDaysAgo = subDays(today, 7);

  // Group last 7d outflows by category
  const last7Out = ctx.money.recentTransactions.filter(
    (t) =>
      t.direction === "out" &&
      !isBefore(parseISO(t.occurred_on), sevenDaysAgo),
  );

  // 1. Category vs 90d weekly baseline
  const byCatLast7: Record<string, { total: number; name: string }> = {};
  for (const t of last7Out) {
    const key = t.category_id ?? "__uncat__";
    const name = t.category_name ?? "Uncategorized";
    byCatLast7[key] = byCatLast7[key] ?? { total: 0, name };
    byCatLast7[key]!.total += Number(t.amount);
  }

  const ninety = subDays(today, 90);
  const weeklyTotals: Record<string, Record<string, number>> = {}; // cat -> week -> total
  for (const t of ctx.money.recentTransactions) {
    if (t.direction !== "out") continue;
    const occurred = parseISO(t.occurred_on);
    if (isBefore(occurred, ninety)) continue;
    const key = t.category_id ?? "__uncat__";
    const weekKey = format(occurred, "yyyy-ww");
    weeklyTotals[key] = weeklyTotals[key] ?? {};
    weeklyTotals[key][weekKey] = (weeklyTotals[key][weekKey] ?? 0) + Number(t.amount);
  }

  for (const [cat, info] of Object.entries(byCatLast7)) {
    const weekly = Object.values(weeklyTotals[cat] ?? {});
    if (weekly.length < 2) continue; // need at least 2 weeks of history
    const med = median(weekly);
    if (med === 0) continue;
    const ratio = info.total / med;
    const delta = info.total - med;
    if (ratio > 1.8 && delta > 50) {
      out.push({
        kind: "spending",
        title: `${info.name}: ${fmtCurrency(info.total)} this week`,
        body: `${ratio.toFixed(1)}× typical (${fmtCurrency(med)} median over last 90d).`,
        severity: ratio > 2.5 ? "warn" : "info",
        evidence: {
          category_id: cat === "__uncat__" ? null : cat,
          week_total: info.total,
          baseline: med,
          ratio,
        },
      });
    }
  }

  // 2. Single-tx outlier (>3x category median tx)
  const txAmountsByCat: Record<string, number[]> = {};
  for (const t of ctx.money.recentTransactions) {
    if (t.direction !== "out") continue;
    const key = t.category_id ?? "__uncat__";
    txAmountsByCat[key] = txAmountsByCat[key] ?? [];
    txAmountsByCat[key].push(Number(t.amount));
  }
  for (const t of last7Out) {
    const key = t.category_id ?? "__uncat__";
    const amounts = txAmountsByCat[key] ?? [];
    if (amounts.length < 5) continue;
    const med = median(amounts);
    if (med === 0) continue;
    const ratio = Number(t.amount) / med;
    if (ratio > 3) {
      out.push({
        kind: "spending",
        title: `Outlier: ${t.merchant ?? "transaction"} ${fmtCurrency(Number(t.amount))}`,
        body: `${ratio.toFixed(1)}× the typical ${t.category_name ?? "uncategorized"} spend.`,
        severity: "info",
        evidence: { tx_id: t.id, multiplier: ratio, category_id: t.category_id },
      });
      break; // one outlier suggestion per run
    }
  }

  // 3. Projection: mtd + upcoming fixed > prior month total + 10%
  const startThisMonth = startOfMonth(today);
  const prevMonthStart = startOfMonth(subMonths(today, 1));
  const prevMonthEnd = endOfMonth(subMonths(today, 1));
  const prevMonthTotal = ctx.money.recentTransactions
    .filter((t) => {
      if (t.direction !== "out") return false;
      const d = parseISO(t.occurred_on);
      return !isBefore(d, prevMonthStart) && isBefore(d, addDays(prevMonthEnd, 1));
    })
    .reduce((s, t) => s + Number(t.amount), 0);
  const upcomingFixedThisMonth = ctx.money.fixedExpensesUpcoming
    .filter((e) => {
      const next = parseISO(e.next_occurs_on);
      return !isBefore(next, startThisMonth) && !isBefore(endOfMonth(today), next);
    })
    .reduce((s, e) => s + Number(e.amount), 0);
  const projected = ctx.money.mtdSpend + upcomingFixedThisMonth;
  if (
    prevMonthTotal > 0 &&
    projected > prevMonthTotal * 1.1
  ) {
    const over = projected - prevMonthTotal;
    out.push({
      kind: "spending",
      title: `Projected over last month by ${fmtCurrency(over)}`,
      body: `MTD ${fmtCurrency(ctx.money.mtdSpend)} + upcoming fixed ${fmtCurrency(upcomingFixedThisMonth)} = ${fmtCurrency(projected)} vs last month ${fmtCurrency(prevMonthTotal)}.`,
      severity: projected > prevMonthTotal * 1.25 ? "warn" : "info",
      evidence: {
        mtd: ctx.money.mtdSpend,
        upcoming_fixed: upcomingFixedThisMonth,
        prev_month: prevMonthTotal,
        projected,
      },
    });
  }

  return out;
}

function habitSuggestions(ctx: AIContext): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const today = parseISO(ctx.forDate);

  // 1. Stalled new habit
  const stalled = ctx.habits.filter(
    (h) =>
      h.current_streak === 0 &&
      !h.logged_today &&
      differenceInDays(today, parseISO(h.created_at)) < 14,
  );
  if (stalled.length > 0) {
    const h = stalled[0]!;
    out.push({
      kind: "habit",
      title: `${h.name} hasn't started`,
      body: "First log is the hardest. Pick the smallest viable version of this and do it today.",
      severity: "info",
      evidence: { habit_id: h.id },
    });
  }

  // 2. Anchor habit
  if (ctx.habits.length > 0) {
    const anchor = [...ctx.habits].sort(
      (a, b) => b.current_streak - a.current_streak,
    )[0]!;
    if (anchor.current_streak >= 14) {
      out.push({
        kind: "habit",
        title: `Anchor habit: ${anchor.name} at ${anchor.current_streak}d`,
        body: "Stack a new behavior immediately after this one. Habits compound when chained.",
        severity: "info",
        evidence: { habit_id: anchor.id, streak: anchor.current_streak },
      });
    }
  }

  // 3. Cluster nudge
  const active = ctx.habits.filter((h) => !h.archived_at);
  if (active.length > 0 && active.length < 3) {
    out.push({
      kind: "habit",
      title: "Habits work better in clusters",
      body: `Only ${active.length} active habit${active.length === 1 ? "" : "s"}. Three to five tend to reinforce each other.`,
      severity: "info",
      evidence: { active_count: active.length },
    });
  } else if (active.length > 10) {
    out.push({
      kind: "habit",
      title: `Tracking ${active.length} habits — consider consolidating`,
      body: "Past ~7 habits, attention fragments. Archive the lowest-signal ones.",
      severity: "info",
      evidence: { active_count: active.length },
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
    return [
      ...productivitySuggestions(ctx),
      ...spendingSuggestions(ctx),
      ...habitSuggestions(ctx),
    ];
  },
};
