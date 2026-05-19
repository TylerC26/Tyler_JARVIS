import { RepoTasksView } from "@/components/modules/repo-tasks/RepoTasksView";
import { listRecentRepoTasksCore } from "@/lib/db/core/repo-tasks";
import { listAllowedRepoSlugs } from "@/lib/repo-tasks/allowlist";

export const dynamic = "force-dynamic";

export default async function RepoTasksPage() {
  const [tasks, allowedSlugs] = await Promise.all([
    listRecentRepoTasksCore(50),
    Promise.resolve(listAllowedRepoSlugs()),
  ]);
  return (
    <div className="flex flex-col">
      <div className="border-b border-warn/40 bg-warn/5 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-warn">
        // archived — remote dispatch is disabled. history below is read-only;
        new submissions will be rejected.
      </div>
      <RepoTasksView initialTasks={tasks} allowedSlugs={allowedSlugs} />
    </div>
  );
}
