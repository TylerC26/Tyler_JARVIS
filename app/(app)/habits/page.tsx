import { HabitsView } from "@/components/modules/habits/HabitsView";
import { listHabitsWithToday } from "@/lib/db/queries/habits";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const habits = await listHabitsWithToday();
  return <HabitsView habits={habits} />;
}
