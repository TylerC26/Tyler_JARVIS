import { MemoryMapView } from "@/components/modules/memory/MemoryMapView";
import { getMemoryGraph } from "@/lib/db/queries/memory-graph";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  // /memory is the Memory Map — a force-directed graph of the memory store.
  // Nodes are active + superseded memories (coloured by kind); edges are
  // semantic k-NN similarity plus superseded-by correction chains. The old
  // list/table view (MemoryView) is retained in components for reference.
  const graph = await getMemoryGraph();
  return <MemoryMapView graph={graph} />;
}
