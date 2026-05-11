import { TasksView } from "@/components/modules/tasks/TasksView";
import { listProjectSummaries } from "@/lib/db/queries/projects";
import { listTasks } from "@/lib/db/queries/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([
    listTasks(),
    listProjectSummaries(),
  ]);
  const projectsById = Object.fromEntries(
    projects.map((p) => [p.id, { name: p.name, slug: p.slug }]),
  );
  return <TasksView tasks={tasks} projectsById={projectsById} />;
}
