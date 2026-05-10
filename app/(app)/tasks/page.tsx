import { TasksView } from "@/components/modules/tasks/TasksView";
import { listTasks } from "@/lib/db/queries/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tasks = await listTasks();
  return <TasksView tasks={tasks} />;
}
