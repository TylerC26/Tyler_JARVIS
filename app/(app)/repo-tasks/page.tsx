import { RepoTasksView } from "@/components/modules/repo-tasks/RepoTasksView";
import { listRecentRepoTasksCore } from "@/lib/db/core/repo-tasks";
import { listAllowedRepoSlugs } from "@/lib/repo-tasks/allowlist";

export const dynamic = "force-dynamic";

export default async function RepoTasksPage() {
  const [tasks, allowedSlugs] = await Promise.all([
    listRecentRepoTasksCore(50),
    Promise.resolve(listAllowedRepoSlugs()),
  ]);
  return <RepoTasksView initialTasks={tasks} allowedSlugs={allowedSlugs} />;
}
