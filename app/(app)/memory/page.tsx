import { MemoryView } from "@/components/modules/memory/MemoryView";
import { listMemories } from "@/lib/db/queries/memory";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  // Active + archived; the view filters between them. Superseded entries are
  // history and stay out of the UI.
  const memories = await listMemories({ statuses: ["active", "archived"] });
  return <MemoryView initialMemories={memories} />;
}
