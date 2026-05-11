import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/modules/projects/ProjectDetailView";
import { listProjectTasks } from "@/lib/db/queries/tasks";
import {
  getProjectSummary,
  listProjectMilestones,
} from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const project = await getProjectSummary(slug);
  if (!project) notFound();
  const [milestones, tasks] = await Promise.all([
    listProjectMilestones(project.id),
    listProjectTasks(project.id),
  ]);
  return (
    <ProjectDetailView project={project} milestones={milestones} tasks={tasks} />
  );
}
