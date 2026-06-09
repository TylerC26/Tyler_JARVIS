import { ProjectsDashboard } from "@/components/modules/projects/ProjectsDashboard";
import { listProjectSummaries } from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

// "Ventures" is the non-work bucket: side hustles + personal projects
// (category = "other"). It reuses the projects dashboard, scoped server-side.
// Venture detail pages live under the canonical /projects/[slug] route.
export default async function VenturesPage() {
  const projects = await listProjectSummaries({ category: "other" });
  return <ProjectsDashboard category="other" initialProjects={projects} />;
}
