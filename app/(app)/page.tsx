import { DateHeroTile } from "@/components/modules/dashboard/DateHeroTile";
import { HabitsTile } from "@/components/modules/dashboard/HabitsTile";
import { TasksTile } from "@/components/modules/dashboard/TasksTile";
import { ExpensesTile } from "@/components/modules/dashboard/ExpensesTile";
import { TransactionsTile } from "@/components/modules/dashboard/TransactionsTile";
import { getLatestBrief } from "@/lib/ai/store";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const brief = await getLatestBrief("morning", todayISO());
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <div className="md:col-span-12">
        <DateHeroTile brief={brief} />
      </div>
      <div className="md:col-span-4">
        <HabitsTile />
      </div>
      <div className="md:col-span-4">
        <TasksTile />
      </div>
      <div className="md:col-span-4">
        <ExpensesTile />
      </div>
      <div className="md:col-span-12">
        <TransactionsTile />
      </div>
    </div>
  );
}
