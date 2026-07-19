import {
  CommandBrief,
  type BriefAction,
  type BriefMetric,
} from "@/components/modules/dashboard/v3/CommandBrief";
import { DaySpine } from "@/components/modules/dashboard/v3/DaySpine";
import { GymProgress } from "@/components/modules/dashboard/v3/GymProgress";
import {
  ProjectLane,
  type LaneProps,
  type LaneTask,
} from "@/components/modules/dashboard/v3/ProjectLane";
import type { Tone } from "@/components/modules/dashboard/v3/tone";
import { getLatestBrief } from "@/lib/ai/store";
import {
  daysFromTodayISO,
  endOfOwnerDay,
  fmtDate,
  fmtDayLabel,
  fmtRelativeDay,
  ownerDaysFromToday,
  startOfOwnerDay,
  todayISO,
} from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { gymAttendanceCore, gymStreak, listSessionsCore } from "@/lib/db/core/gym";
import { listProjectSummaries, type ProjectSummary } from "@/lib/db/queries/projects";
import { listTasks } from "@/lib/db/queries/tasks";
import type { ProjectStatus, Task } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_LANES = 5;
const LANE_TASKS = 5;

// Risk ordering for the lane list — most-urgent projects float to the top.
const TONE_RANK: Record<Tone, number> = {
  danger: 0,
  warn: 1,
  accent: 2,
  success: 3,
  neutral: 4,
};

function dueDay(due: string | null): number {
  return due ? startOfOwnerDay(due).getTime() : Infinity;
}

// Derive the lane's display status + accent from the real project status,
// escalated by outstanding-work signals (overdue tasks, an imminent milestone).
function laneStatus(
  status: ProjectStatus,
  overdue: number,
  dueToday: number,
  nextMsDays: number | null,
): { label: string; tone: Tone } {
  switch (status) {
    case "shipped":
      return { label: "SHIPPED", tone: "success" };
    case "paused":
      return { label: "PAUSED", tone: "warn" };
    case "idea":
      return { label: "PLANNING", tone: "neutral" };
    default: {
      if (overdue > 0) return { label: "AT RISK", tone: "danger" };
      if (nextMsDays != null && nextMsDays >= 0 && nextMsDays <= 5)
        return { label: "REVIEW", tone: "warn" };
      if (dueToday > 0) return { label: "ACTIVE", tone: "accent" };
      return { label: "ON TRACK", tone: "success" };
    }
  }
}

function taskDue(due: string | null): {
  label: string;
  tone: Tone;
  overdue: boolean;
  muted: boolean;
} {
  if (!due) return { label: "—", tone: "neutral", overdue: false, muted: true };
  const d = ownerDaysFromToday(due);
  if (d < 0) return { label: `${d}d`, tone: "danger", overdue: true, muted: false };
  if (d === 0) return { label: "today", tone: "accent", overdue: false, muted: false };
  return { label: `+${d}d`, tone: "neutral", overdue: false, muted: true };
}

function buildLane(
  p: ProjectSummary,
  openTasks: Task[],
  summaryTime: string | null,
): LaneProps & { rank: number } {
  const projTasks = openTasks
    .filter((t) => t.project_id === p.id)
    .sort((a, b) => {
      const da = dueDay(a.due_at);
      const db = dueDay(b.due_at);
      if (da !== db) return da - db;
      return a.priority - b.priority;
    });
  const start = startOfOwnerDay().getTime();
  const overdue = projTasks.filter((t) => dueDay(t.due_at) < start).length;
  const dueToday = projTasks.filter((t) => dueDay(t.due_at) === start).length;

  const nextMsDays =
    p.next_milestone?.target_date != null
      ? ownerDaysFromToday(p.next_milestone.target_date)
      : null;
  const { label: statusLabel, tone } = laneStatus(
    p.status,
    overdue,
    dueToday,
    nextMsDays,
  );

  const totalTasks = p.open_task_count + p.done_task_count;
  const progressPct = totalTasks > 0 ? p.task_pct : p.milestone_pct;

  const countParts = [`${p.open_task_count} open`];
  if (overdue > 0) countParts.push(`${overdue} overdue`);
  if (totalTasks > 0) countParts.push(`${p.done_task_count}/${totalTasks} done`);
  else if (nextMsDays != null && nextMsDays >= 0)
    countParts.push(`next ${nextMsDays}d`);

  const nextMilestone = p.next_milestone
    ? {
        title: p.next_milestone.title,
        date: p.next_milestone.target_date
          ? fmtDayLabel(p.next_milestone.target_date, "MMM d")
          : "TBD",
      }
    : null;

  const summary =
    p.description?.trim() ||
    [
      `${p.open_task_count} open${overdue > 0 ? `, ${overdue} overdue` : ""}.`,
      nextMilestone
        ? `Next: ${nextMilestone.title} · ${nextMilestone.date}.`
        : "No milestone set.",
    ].join(" ");

  const tasks: LaneTask[] = projTasks.slice(0, LANE_TASKS).map((t) => {
    const due = taskDue(t.due_at);
    return {
      id: t.id,
      title: t.title,
      dueLabel: due.label,
      dueTone: due.tone,
      overdue: due.overdue,
      muted: due.muted,
    };
  });

  return {
    name: p.name,
    slug: p.slug,
    tone,
    statusLabel,
    progressPct,
    countsLine: countParts.join(" · "),
    nextMilestone,
    summary,
    summaryTime,
    tasks,
    rank: TONE_RANK[tone],
  };
}

export default async function DashboardPage() {
  const today = todayISO();
  const yesterday = daysFromTodayISO(-1);
  const dayStart = startOfOwnerDay();
  const dayEnd = endOfOwnerDay();
  const gymSince = new Date(dayStart.getTime() - 59 * DAY_MS).toISOString();
  const startMs = dayStart.getTime();

  const [brief, events, allTasks, projects, gymSessions, gymDays] =
    await Promise.all([
      getLatestBrief("morning", today),
      listEventsInRangeCore(dayStart.toISOString(), dayEnd.toISOString()),
      listTasks(),
      listProjectSummaries(),
      listSessionsCore({ limit: 1 }),
      gymAttendanceCore({ since: gymSince }),
    ]);

  // --- tasks ---
  const open = allTasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => dueDay(t.due_at) < startMs).length;
  const dueToday = open.filter((t) => dueDay(t.due_at) <= startMs).length;
  const dueTodayProjects = new Set(
    open
      .filter((t) => dueDay(t.due_at) <= startMs && t.project_id)
      .map((t) => t.project_id),
  ).size;

  // --- events: next timed event today ---
  const now = Date.now();
  const timed = events
    .filter((e) => !e.all_day)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const current = timed.find(
    (e) => +new Date(e.starts_at) <= now && +new Date(e.ends_at) >= now,
  );
  const upcoming = timed.find((e) => +new Date(e.starts_at) > now);
  const eventSub = current
    ? "in progress"
    : upcoming
      ? `next ${fmtDate(upcoming.starts_at, "HH:mm")}`
      : "clear";

  // --- projects → lanes ---
  const briefTime = brief ? fmtDate(brief.created_at, "HH:mm") : null;
  // Which projects surface as lanes is now owner-curated via the per-project
  // `show_on_dashboard` toggle (set on each card in /projects). Archived
  // projects are always excluded; the rest are risk-sorted + capped below.
  const active = projects.filter(
    (p) => p.status !== "archived" && p.show_on_dashboard,
  );
  const lanes = active
    .map((p) =>
      buildLane(
        p,
        open,
        p.updated_at ? fmtDate(p.updated_at, "MMM d") : null,
      ),
    )
    .sort((a, b) => a.rank - b.rank || b.tasks.length - a.tasks.length)
    .slice(0, MAX_LANES);
  const atRisk = lanes.filter((l) => l.statusLabel === "AT RISK").length;
  const activeProjectCount = projects.filter(
    (p) => p.status === "active",
  ).length;

  // --- gym ---
  const streak = gymStreak(
    gymDays.map((d) => d.date),
    today,
    yesterday,
  );
  const gymByDate = new Map(gymDays.map((d) => [d.date, d.count]));
  const attendance = Array.from(
    { length: 14 },
    (_, i) => gymByDate.get(daysFromTodayISO(i - 13)) ?? 0,
  );
  const weekCount = attendance.slice(-7).filter((c) => c > 0).length;
  const trainedToday = (gymByDate.get(today) ?? 0) > 0;
  const gymSession = gymSessions[0] ?? null;

  // --- readout metrics + Claudia actions ---
  const metrics: BriefMetric[] = [
    {
      label: "OPEN",
      value: String(open.length),
      sub: overdue > 0 ? `${overdue} overdue` : "on track",
      tone: "accent",
      subTone: overdue > 0 ? "danger" : undefined,
      href: "/tasks",
    },
    {
      label: "DUE TODAY",
      value: String(dueToday),
      sub: dueTodayProjects > 0 ? `${dueTodayProjects} projects` : "clear",
      href: "/tasks",
    },
    {
      label: "PROJECTS",
      value: String(activeProjectCount),
      sub: atRisk > 0 ? `${atRisk} at risk` : "on track",
      subTone: atRisk > 0 ? "danger" : undefined,
      href: "/projects",
    },
    {
      label: "EVENTS",
      value: String(events.length),
      sub: eventSub,
      href: "/calendar",
    },
    {
      label: "GYM",
      value: String(streak),
      unit: "d",
      sub: trainedToday ? "trained today" : "rest day",
      tone: "warn",
      href: "/gym",
    },
  ];

  const actions: BriefAction[] = [
    { label: "✦ Re-plan my day", href: "/assistant", tone: "warn" },
    { label: "✦ Draft standup", href: "/assistant", tone: "warn" },
    ...(overdue > 0
      ? [
          {
            label: `! Resolve ${overdue} overdue ›`,
            href: "/tasks",
            tone: "danger" as Tone,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-2.75rem)] flex-col gap-4">
      <CommandBrief
        briefSummary={brief?.summary ?? null}
        briefEngine={brief?.engine ?? null}
        briefTime={briefTime}
        metrics={metrics}
        actions={actions}
      />

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        {/* ---- outstanding by project ---- */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-accent">◆</span>
            <span className="font-hud text-[11px] uppercase tracking-[0.16em] text-fg-dim">
              // Outstanding by project
            </span>
            <span aria-hidden className="h-px flex-1 bg-edge" />
            <a
              href="/projects"
              className="whitespace-nowrap font-mono text-[11px] text-fg-dim transition-colors hover:text-accent"
            >
              ALL PROJECTS ›
            </a>
          </div>

          {lanes.length === 0 ? (
            <div className="grid flex-1 place-items-center rounded-md border border-edge bg-surface px-4 py-10 font-mono text-[12px] text-fg-dim">
              No outstanding projects
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lanes.map((lane) => (
                <ProjectLane key={lane.slug} {...lane} />
              ))}
            </div>
          )}
        </div>

        {/* ---- day spine + gym ----
            Stacked on phones and inside the xl right-rail, but laid out 2-up in
            the lg→xl band (iPad mini landscape, 1133px) so the short viewport
            doesn't push these two cards far below the fold. */}
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start xl:flex-col">
          <div className="min-w-0 lg:flex-1 xl:flex-none">
            <DaySpine events={events} />
          </div>
          <div className="min-w-0 lg:flex-1 xl:flex-none">
            <GymProgress
              streak={streak}
              session={gymSession}
              sessionDayLabel={
                gymSession ? fmtRelativeDay(gymSession.performed_at) : null
              }
              attendance={attendance}
              weekCount={weekCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
