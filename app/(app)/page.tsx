import { ChatPanel } from "@/components/modules/chat/ChatPanel";
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
  const configured = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <div className="md:col-span-12">
        <DateHeroTile brief={brief} />
      </div>

      <div className="md:col-span-5">
        <div className="h-[600px]">
          <ChatPanel configured={configured} variant="page" />
        </div>
      </div>

      <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HabitsTile />
        <TasksTile />
        <ExpensesTile />
      </div>

      <div className="md:col-span-12">
        <TransactionsTile />
      </div>
    </div>
  );
}
