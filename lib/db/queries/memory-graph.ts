import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  MemoryConfidence,
  MemoryKind,
  MemorySource,
  MemoryStatus,
} from "@/lib/db/types";

// One node = one memory row. Only the fields the graph renders/inspects — the
// 1536-float embedding stays server-side (edges are computed from it, never the
// vector shipped to the client).
export type MemoryGraphNode = {
  id: string;
  kind: MemoryKind;
  topic: string | null;
  subtopic: string | null;
  key: string;
  value: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  pinned: boolean;
  status: MemoryStatus; // 'active' | 'superseded' (archived excluded)
  used_count: number;
  last_used_at: string | null;
  created_at: string;
  // False → this active memory has no embedding yet, so it can carry no
  // semantic edges (a re-embed will link it). Surfaced as an "unlinked" node.
  hasEmbedding: boolean;
};

export type MemoryGraphEdge = {
  source: string;
  target: string;
  // Cosine similarity for 'semantic'; 1 for a 'supersede' correction link.
  weight: number;
  type: "semantic" | "supersede";
};

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  stats: {
    total: number;
    active: number;
    superseded: number;
    unlinked: number; // active nodes with zero edges
    semanticEdges: number;
    supersedeEdges: number;
  };
};

const EMPTY: MemoryGraph = {
  nodes: [],
  edges: [],
  stats: {
    total: 0,
    active: 0,
    superseded: 0,
    unlinked: 0,
    semanticEdges: 0,
    supersedeEdges: 0,
  },
};

// Columns the graph needs — deliberately omits `embedding` (large, and edges
// are derived server-side by the memory_graph_edges RPC, not on the client).
const NODE_COLUMNS =
  "id,kind,topic,subtopic,key,value,source,confidence,pinned,status," +
  "superseded_by,used_count,last_used_at,created_at";

type NodeRow = {
  id: string;
  kind: MemoryKind;
  topic: string | null;
  subtopic: string | null;
  key: string;
  value: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  pinned: boolean;
  status: MemoryStatus;
  superseded_by: string | null;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
};

type EdgeRow = { source_id: string; target_id: string; similarity: number };

// Build the full memory graph for the /memory view.
//
// Nodes: active + superseded memories (archived is history, left out). Edges:
// (1) semantic k-NN from the memory_graph_edges RPC among active/embedded rows,
// deduped to undirected pairs keeping the strongest similarity; (2) supersede
// correction chains from `superseded_by` where both ends are loaded.
//
// `k` / `minSim` pass straight through to the RPC so the fan-out and floor can
// be tuned per call. Defaults match the migration (k=6, minSim=0.45).
export async function getMemoryGraph(
  { k = 6, minSim = 0.45 }: { k?: number; minSim?: number } = {},
): Promise<MemoryGraph> {
  const supabase = await getSupabaseServer();
  if (!supabase) return EMPTY;
  const owner = getOwnerId();

  const [nodesRes, embeddedRes, edgesRes] = await Promise.all([
    supabase
      .from("memory_entries")
      .select(NODE_COLUMNS)
      .eq("owner_id", owner)
      .in("status", ["active", "superseded"])
      .order("created_at", { ascending: true }),
    // Ids of active rows that actually carry a vector — cheap (no vectors
    // transferred), used to flag unlinked nodes.
    supabase
      .from("memory_entries")
      .select("id")
      .eq("owner_id", owner)
      .eq("status", "active")
      .not("embedding", "is", null),
    supabase.rpc("memory_graph_edges", { owner, k, min_sim: minSim }),
  ]);

  const rows = (nodesRes.data as NodeRow[] | null) ?? [];
  if (rows.length === 0) return EMPTY;

  const embeddedIds = new Set(
    ((embeddedRes.data as { id: string }[] | null) ?? []).map((r) => r.id),
  );
  const idSet = new Set(rows.map((r) => r.id));

  const nodes: MemoryGraphNode[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    topic: r.topic,
    subtopic: r.subtopic,
    key: r.key,
    value: r.value,
    source: r.source,
    confidence: r.confidence,
    pinned: r.pinned,
    status: r.status,
    used_count: r.used_count,
    last_used_at: r.last_used_at,
    created_at: r.created_at,
    hasEmbedding: embeddedIds.has(r.id),
  }));

  // Semantic edges — dedupe directed top-k pairs to undirected, keep max sim.
  const semantic = new Map<string, MemoryGraphEdge>();
  for (const e of (edgesRes.data as EdgeRow[] | null) ?? []) {
    if (e.source_id === e.target_id) continue;
    if (!idSet.has(e.source_id) || !idSet.has(e.target_id)) continue;
    const [a, b] =
      e.source_id < e.target_id
        ? [e.source_id, e.target_id]
        : [e.target_id, e.source_id];
    const key = `${a}|${b}`;
    const existing = semantic.get(key);
    if (!existing || e.similarity > existing.weight) {
      semantic.set(key, {
        source: a,
        target: b,
        weight: e.similarity,
        type: "semantic",
      });
    }
  }

  // Supersede chains — old (superseded) row -> its active replacement.
  const supersede: MemoryGraphEdge[] = [];
  for (const r of rows) {
    if (
      r.status === "superseded" &&
      r.superseded_by &&
      idSet.has(r.superseded_by)
    ) {
      supersede.push({
        source: r.id,
        target: r.superseded_by,
        weight: 1,
        type: "supersede",
      });
    }
  }

  const edges = [...semantic.values(), ...supersede];

  // Unlinked = active nodes touched by no edge.
  const linked = new Set<string>();
  for (const e of edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  const activeCount = rows.filter((r) => r.status === "active").length;
  const unlinked = nodes.filter(
    (n) => n.status === "active" && !linked.has(n.id),
  ).length;

  return {
    nodes,
    edges,
    stats: {
      total: nodes.length,
      active: activeCount,
      superseded: nodes.length - activeCount,
      unlinked,
      semanticEdges: semantic.size,
      supersedeEdges: supersede.length,
    },
  };
}
