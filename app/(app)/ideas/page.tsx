import { IdeasView } from "@/components/modules/ideas/IdeasView";
import { listIdeasCore } from "@/lib/db/core/ideas";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const [active, archived] = await Promise.all([
    listIdeasCore(),
    listIdeasCore({ includeArchived: true }).then((all) =>
      all.filter((i) => i.archived_at),
    ),
  ]);
  return <IdeasView initialActive={active} initialArchived={archived} />;
}
