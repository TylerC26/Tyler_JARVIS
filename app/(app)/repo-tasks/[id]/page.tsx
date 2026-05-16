import { notFound } from "next/navigation";
import { RepoTaskDetailView } from "@/components/modules/repo-tasks/RepoTaskDetailView";
import { getRepoTaskCore } from "@/lib/db/core/repo-tasks";

export const dynamic = "force-dynamic";

export default async function RepoTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getRepoTaskCore(id);
  if (!task) notFound();
  return <RepoTaskDetailView initialTask={task} />;
}
