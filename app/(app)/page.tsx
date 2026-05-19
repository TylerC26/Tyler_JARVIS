import { TerminalAgenda } from "@/components/modules/dashboard/TerminalAgenda";
import { TerminalBrief } from "@/components/modules/dashboard/TerminalBrief";
import { TerminalHeader } from "@/components/modules/dashboard/TerminalHeader";
import { TerminalPrompt } from "@/components/modules/dashboard/TerminalPrompt";
import { TerminalRecent } from "@/components/modules/dashboard/TerminalRecent";
import { TerminalSpend } from "@/components/modules/dashboard/TerminalSpend";
import { TerminalTasks } from "@/components/modules/dashboard/TerminalTasks";
import { getLatestBrief } from "@/lib/ai/store";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listIdeasCore } from "@/lib/db/core/ideas";
import { listNotesCore } from "@/lib/db/core/notes";
import { listTodayTasks } from "@/lib/db/queries/tasks";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayISO();
  const dayStart = startOfOwnerDay();
  const dayEnd = endOfOwnerDay();

  const [brief, events, shifts, tasks, notes, ideas] = await Promise.all([
    getLatestBrief("morning", today),
    listEventsInRangeCore(dayStart.toISOString(), dayEnd.toISOString()),
    listWifeShiftsInRangeCore(today, today),
    listTodayTasks(6),
    listNotesCore(),
    listIdeasCore(),
  ]);

  return (
    <div className="crt-scanlines relative min-h-[calc(100vh-8rem)] rounded-md border border-edge bg-base/40 px-4 py-3 md:px-6 md:py-4">
      <div className="relative z-[2] flex flex-col gap-4">
        <TerminalHeader
          wifeShift={shifts[0]?.code ?? null}
          eventCount={events.length}
          taskCount={tasks.length}
        />
        <TerminalBrief brief={brief} />
        <TerminalAgenda events={events} />
        <TerminalTasks />
        <TerminalSpend />
        <TerminalRecent notes={notes.slice(0, 5)} ideas={ideas.slice(0, 5)} />
        <div className="mt-2 border-t border-edge pt-3">
          <TerminalPrompt />
        </div>
      </div>
    </div>
  );
}
