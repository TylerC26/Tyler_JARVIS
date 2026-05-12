import { MemoryView } from "@/components/modules/memory/MemoryView";
import { listMemories } from "@/lib/db/queries/memory";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const memories = await listMemories();
  return <MemoryView initialMemories={memories} />;
}
