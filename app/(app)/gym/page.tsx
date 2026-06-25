// /gym — strength training dashboard. Server component: fetches the attendance
// heat map (last 26 weeks), per-exercise progression summaries (last 90 days),
// and recent sessions, then composes the HUD. The training data is logged by
// Matt (the personal-trainer agent) via the log_workout chat tool — there's no
// manual logger here; the only mutation is deleting a mis-logged session.
//
// Gating matches the rest of (app): single-user local mode — server-side owner
// scoping + RLS are the protection layer.

import { PageHeader } from "@/components/ui/PageHeader";
import { AttendanceHeatMap } from "@/components/modules/gym/AttendanceHeatMap";
import { ExerciseProgressCard } from "@/components/modules/gym/ExerciseProgressCard";
import { GymStats } from "@/components/modules/gym/GymStats";
import { SessionList } from "@/components/modules/gym/SessionList";
import {
  gymAttendanceCore,
  gymStreak,
  listExercisesCore,
  listSessionsCore,
} from "@/lib/db/core/gym";
import { daysFromTodayISO, todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

const HEATMAP_WEEKS = 26;
const PROGRESS_DAYS = 90;
const RECENT_SESSIONS = 15;

export default async function GymPage() {
  const heatmapSince = new Date(
    Date.now() - HEATMAP_WEEKS * 7 * 86_400_000,
  ).toISOString();
  const progressSince = new Date(
    Date.now() - PROGRESS_DAYS * 86_400_000,
  ).toISOString();

  const [attendance, exercises, sessions] = await Promise.all([
    gymAttendanceCore({ since: heatmapSince }),
    listExercisesCore({ since: progressSince }),
    listSessionsCore({ since: heatmapSince, limit: RECENT_SESSIONS }),
  ]);

  const today = todayISO();
  const yesterday = daysFromTodayISO(-1);
  const weekAgo = daysFromTodayISO(-6); // inclusive 7-day window (today + 6 back)

  const streak = gymStreak(
    attendance.flatMap((a) => Array(a.count).fill(a.date)),
    today,
    yesterday,
  );
  const weekSessions = attendance
    .filter((a) => a.date >= weekAgo)
    .reduce((acc, a) => acc + a.count, 0);
  const windowSessions = attendance.reduce((acc, a) => acc + a.count, 0);

  const isEmpty =
    attendance.length === 0 && exercises.length === 0 && sessions.length === 0;

  return (
    <div>
      <PageHeader
        code="GYM-01"
        title="Gym"
        subtitle="Strength progression + attendance — logged by Matt as you train."
      />

      {isEmpty ? (
        <div className="rounded-md border border-edge bg-surface-2/40 p-6 font-mono text-sm text-fg-muted">
          No workouts logged yet. Tell Matt about a session on /chat or Telegram
          — e.g. &quot;push day: bench 100kg 8/8/6, OHP 60kg 3x10&quot; — and it
          lands here with progression charts and an attendance heat map.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <GymStats
            streak={streak}
            weekSessions={weekSessions}
            windowSessions={windowSessions}
            windowWeeks={HEATMAP_WEEKS}
            exercisesTracked={exercises.length}
          />

          <AttendanceHeatMap
            attendance={attendance}
            todayISO={today}
            weeks={HEATMAP_WEEKS}
          />

          <section>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              // progression — last {PROGRESS_DAYS} days
            </div>
            {exercises.length === 0 ? (
              <div className="rounded-md border border-edge bg-surface-2/40 p-4 font-mono text-xs text-fg-dim">
                No exercises in the last {PROGRESS_DAYS} days.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {exercises.map((ex) => (
                  <ExerciseProgressCard key={ex.exercise_slug} summary={ex} />
                ))}
              </div>
            )}
          </section>

          {sessions.length > 0 && <SessionList sessions={sessions} />}
        </div>
      )}
    </div>
  );
}
