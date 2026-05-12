import { AgendaTile } from "@/components/modules/dashboard/AgendaTile";
import { DateHeroTile } from "@/components/modules/dashboard/DateHeroTile";
import { FocusTile } from "@/components/modules/dashboard/FocusTile";
import { HabitsTile } from "@/components/modules/dashboard/HabitsTile";
import { MoneyPulseTile } from "@/components/modules/dashboard/MoneyPulseTile";
import { ProjectsPulseTile } from "@/components/modules/dashboard/ProjectsPulseTile";
import { SignalsTile } from "@/components/modules/dashboard/SignalsTile";
import { TodayTimelineTile } from "@/components/modules/dashboard/TodayTimelineTile";
import { getLatestBrief } from "@/lib/ai/store";
import { todayISO } from "@/lib/date";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayISO();
  const [brief, shifts] = await Promise.all([
    getLatestBrief("morning", today),
    listWifeShiftsInRangeCore(today, today),
  ]);
  const wifeShiftToday = shifts[0]?.code ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <div className="md:col-span-12">
        <DateHeroTile brief={brief} wifeShiftToday={wifeShiftToday} />
      </div>

      <div className="md:col-span-8">
        <TodayTimelineTile />
      </div>
      <div className="md:col-span-4">
        <FocusTile />
      </div>

      <div className="md:col-span-4">
        <HabitsTile />
      </div>
      <div className="md:col-span-4">
        <ProjectsPulseTile />
      </div>
      <div className="md:col-span-4">
        <SignalsTile />
      </div>

      <div className="md:col-span-8">
        <MoneyPulseTile />
      </div>
      <div className="md:col-span-4">
        <AgendaTile />
      </div>
    </div>
  );
}
