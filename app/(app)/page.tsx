import { BriefPanel } from "@/components/modules/dashboard/BriefPanel";
import { GreetingStrip } from "@/components/modules/dashboard/GreetingStrip";
import { GymPanel } from "@/components/modules/dashboard/GymPanel";
import { HudBackdrop } from "@/components/modules/dashboard/HudBackdrop";
import {
  StatRibbon,
  type StatCell,
} from "@/components/modules/dashboard/StatRibbon";
import { TasksPanel } from "@/components/modules/dashboard/TasksPanel";
import { TodayPanel } from "@/components/modules/dashboard/TodayPanel";
import { getLatestBrief } from "@/lib/ai/store";
import {
  daysFromTodayISO,
  endOfOwnerDay,
  fmtDate,
  startOfOwnerDay,
  startOfOwnerMonth,
  todayISO,
} from "@/lib/date";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import { listAgentsCore } from "@/lib/db/core/agents";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { gymAttendanceCore, gymStreak, listSessionsCore } from "@/lib/db/core/gym";
import { listMeetingsCore } from "@/lib/db/core/meetings";
import { getSpendSummaryCore } from "@/lib/db/core/usage";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { listTasks } from "@/lib/db/queries/tasks";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const TASK_ROWS = 6;

export default async function DashboardPage() {
  const today = todayISO();
  const yesterday = daysFromTodayISO(-1);
  const dayStart = startOfOwnerDay();
  const dayEnd = endOfOwnerDay();
  // Streak can run far past the sparkline window — pull 60 days of attendance
  // and slice the last 14 for the bars.
  const gymSince = new Date(dayStart.getTime() - 59 * DAY_MS).toISOString();
  const weekAgo = new Date(dayStart.getTime() - 6 * DAY_MS);

  const [
    brief,
    events,
    shifts,
    allTasks,
    spend,
    agents,
    runs,
    meetings,
    gymSessions,
    gymDays,
  ] = await Promise.all([
    getLatestBrief("morning", today),
    listEventsInRangeCore(dayStart.toISOString(), dayEnd.toISOString()),
    listWifeShiftsInRangeCore(today, today),
    listTasks(),
    getSpendSummaryCore(startOfOwnerMonth().toISOString()),
    listAgentsCore({ activeOnly: true }),
    listRecentAgentRunsCore(14),
    listMeetingsCore({ limit: 30 }),
    listSessionsCore({ limit: 1 }),
    gymAttendanceCore({ since: gymSince }),
  ]);

  // --- tasks: urgency ordering + due/overdue counts ---
  const open = allTasks.filter((t) => t.status !== "done");
  const dueDay = (t: (typeof open)[number]) =>
    t.due_at ? startOfOwnerDay(t.due_at).getTime() : Infinity;
  const byUrgency = [...open].sort((a, b) => {
    const da = dueDay(a);
    const db = dueDay(b);
    if (da !== db) return da - db;
    return a.priority - b.priority;
  });
  const overdue = open.filter((t) => dueDay(t) < dayStart.getTime()).length;
  const dueToday = open.filter((t) => dueDay(t) <= dayStart.getTime()).length;

  // --- events: next upcoming timed event today ---
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

  // --- agents / meetings / gym / spend ---
  const running = runs.filter((r) => r.status === "running").length;
  const meetingsThisWeek = meetings.filter(
    (m) => new Date(m.started_at) >= weekAgo,
  ).length;
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

  const cells: StatCell[] = [
    {
      label: "Tasks due",
      value: String(dueToday),
      sub: overdue > 0 ? `${overdue} overdue` : "on schedule",
      tone: "text-accent",
      subTone: overdue > 0 ? "text-danger" : undefined,
      href: "/tasks",
    },
    {
      label: "Events",
      value: String(events.length),
      sub: eventSub,
      href: "/calendar",
    },
    {
      label: "Agents",
      value: String(agents.length),
      sub: running > 0 ? `${running} running` : "monitoring",
      tone: "text-success",
      href: "/agents",
    },
    {
      label: "Meetings",
      value: String(meetingsThisWeek),
      sub: "this week",
      href: "/meetings",
    },
    {
      label: "Gym streak",
      value: `${streak}d`,
      sub: gymDays.at(-1)?.date === today ? "trained today" : "rest day",
      tone: "text-warn",
      href: "/gym",
    },
    {
      label: "Spend",
      value: `$${Math.round(spend.total_usd)}`,
      sub: "llm · this month",
      href: "/llm",
    },
  ];

  return (
    <>
      <HudBackdrop />
      {/* min-h = viewport minus the h-14 top bar and the main px/py gutters,
          so the two columns stretch and the page has no dead zone below. */}
      <div className="flex min-h-[calc(100dvh-3.5rem-2.75rem)] flex-col gap-4">
        <GreetingStrip wifeShift={shifts[0]?.code ?? null} />
        <StatRibbon cells={cells} />
        {/* Columns are grids (not flex) so the 1fr card absorbs the leftover
            height — Panel's own h-full fights flex-1 sizing otherwise. */}
        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_1fr]">
          <div className="grid min-w-0 grid-rows-[auto_1fr] gap-4">
            <BriefPanel brief={brief} />
            <TodayPanel events={events} />
          </div>
          <div className="grid min-w-0 grid-rows-[1fr_auto] gap-4">
            <TasksPanel
              tasks={byUrgency.slice(0, TASK_ROWS)}
              total={open.length}
              overdue={overdue}
            />
            <GymPanel
              streak={streak}
              lastSession={gymSessions[0] ?? null}
              attendance={attendance}
            />
          </div>
        </div>
      </div>
    </>
  );
}
