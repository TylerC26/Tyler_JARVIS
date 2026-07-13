-- 0063 // semantic edge generator for the Memory Map graph view
-- Returns the top-k nearest neighbours (by cosine similarity) for every active,
-- embedded memory in one round-trip — the edge set behind /memory's graph.
--
-- O(n·k): the lateral subquery's `order by embedding <=> m.embedding` rides the
-- HNSW index (memory_entries_embedding_idx) per row, so this is NOT the O(n²)
-- pairwise matrix. Returns directed pairs (source -> its neighbours); the caller
-- dedupes to undirected. `min_sim` floors out weak links; k caps fan-out.
--
-- Defaults (k=6, min_sim=0.45) are tuned to the live store's similarity
-- distribution (OpenAI-space vectors: top-6 median ~0.50) — ~5 edges/node,
-- connected but not a hairball. Re-tune if the embedding model changes.
--
-- SECURITY INVOKER (default) — only ever called through the service-role server
-- client, same as match_memories. search_path pinned per the 0034 posture.

create or replace function public.memory_graph_edges(
  owner uuid,
  k int default 6,
  min_sim double precision default 0.45
)
returns table (source_id uuid, target_id uuid, similarity double precision)
language sql
stable
set search_path = extensions, public, pg_temp
as $$
  select m.id as source_id, nb.id as target_id, nb.similarity
  from public.memory_entries m
  cross join lateral (
    select e.id, 1 - (e.embedding <=> m.embedding) as similarity
    from public.memory_entries e
    where e.owner_id = owner
      and e.status = 'active'
      and e.embedding is not null
      and e.id <> m.id
    order by e.embedding <=> m.embedding asc
    limit k
  ) nb
  where m.owner_id = owner
    and m.status = 'active'
    and m.embedding is not null
    and nb.similarity >= min_sim;
$$;
