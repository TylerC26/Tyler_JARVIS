import { TerminalAgenda } from "@/components/modules/dashboard/TerminalAgenda";
import { TerminalBrief } from "@/components/modules/dashboard/TerminalBrief";
import { TerminalHeader } from "@/components/modules/dashboard/TerminalHeader";
import { TerminalOffice } from "@/components/modules/dashboard/TerminalOffice";
import { TerminalPlaces } from "@/components/modules/dashboard/TerminalPlaces";
import { TerminalPrompt } from "@/components/modules/dashboard/TerminalPrompt";
import { TerminalRecent } from "@/components/modules/dashboard/TerminalRecent";
import { TerminalSpend } from "@/components/modules/dashboard/TerminalSpend";
import { TerminalTasks } from "@/components/modules/dashboard/TerminalTasks";
import { getLatestBrief } from "@/lib/ai/store";
import { endOfOwnerDay, startOfOwnerDay, todayISO } from "@/lib/date";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listIdeasCore } from "@/lib/db/core/ideas";
import { listNotesCore } from "@/lib/db/core/notes";
import { listPlacesCore } from "@/lib/db/core/places";
import { listTodayTasks } from "@/lib/db/queries/tasks";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayISO();
  const dayStart = startOfOwnerDay();
  const dayEnd = endOfOwnerDay();

  const [brief, events, shifts, tasks, notes, ideas, places] =
    await Promise.all([
      getLatestBrief("morning", today),
      listEventsInRangeCore(dayStart.toISOString(), dayEnd.toISOString()),
      listWifeShiftsInRangeCore(today, today),
      listTodayTasks(6),
      listNotesCore(),
      listIdeasCore(),
      listPlacesCore({ status: "want_to_go" }),
    ]);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-6">
      <TerminalHeader
        wifeShift={shifts[0]?.code ?? null}
        eventCount={events.length}
        taskCount={tasks.length}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="md:col-span-2 xl:col-span-3">
          <TerminalBrief brief={brief} />
        </div>
        <div className="md:col-span-1 xl:col-span-3">
          <TerminalAgenda events={events} />
        </div>
        <div className="md:col-span-1 xl:col-span-2">
          <TerminalTasks />
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <TerminalOffice />
        </div>
        <div className="md:col-span-1 xl:col-span-2">
          <TerminalSpend />
        </div>
        <div className="md:col-span-1 xl:col-span-2">
          <TerminalRecent notes={notes.slice(0, 5)} ideas={ideas.slice(0, 5)} />
        </div>
        <div className="md:col-span-2 xl:col-span-2">
          <TerminalPlaces places={places} />
        </div>
        <div className="md:col-span-2 xl:col-span-6">
          <TerminalPrompt />
        </div>
      </div>
    </div>
  );
}
