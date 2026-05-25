import { KcalView } from "@/components/modules/kcal/KcalView";
import { listMealsCore } from "@/lib/db/core/meals";

export const dynamic = "force-dynamic";

export default async function KcalPage() {
  // 14 days is enough for the "today + recent past" rhythm of /kcal without
  // pulling the whole history into one render.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const meals = await listMealsCore({ since, limit: 200 });
  return <KcalView initialMeals={meals} />;
}
