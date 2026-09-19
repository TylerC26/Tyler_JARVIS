import { TriageView } from "@/components/modules/triage/TriageView";
import { listPendingInboxCore } from "@/lib/db/core/inbox";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const pending = await listPendingInboxCore();
  return <TriageView initialPending={pending} />;
}
