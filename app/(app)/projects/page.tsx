import { ProjectsDashboard } from "@/components/modules/projects/ProjectsDashboard";
import { listProjectSummaries } from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjectSummaries({ category: "work" });
  return <ProjectsDashboard category="work" initialProjects={projects} />;
}
