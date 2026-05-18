-- 0027 // semantic memory via pgvector
-- Adds an embedding column to memory_entries plus an HNSW cosine index, and a
-- match_memories RPC for semantic retrieval. Existing rows keep embedding=NULL
-- until they're updated or re-embedded. The match function only returns rows
-- whose embedding is set, so pinned/legacy entries still flow through the
-- standard recency path until they're embedded.

create extension if not exists vector with schema extensions;

alter table public.memory_entries
  add column if not exists embedding extensions.vector(1536);

create index if not exists memory_entries_embedding_idx
  on public.memory_entries
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_memories(
  query_embedding extensions.vector(1536),
  owner uuid,
  match_count int
)
returns table (
  id uuid,
  owner_id uuid,
  scope text,
  kind text,
  key text,
  value text,
  source text,
  confidence text,
  pinned boolean,
  used_count int,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    me.id,
    me.owner_id,
    me.scope,
    me.kind,
    me.key,
    me.value,
    me.source,
    me.confidence,
    me.pinned,
    me.used_count,
    me.last_used_at,
    me.created_at,
    me.updated_at,
    1 - (me.embedding <=> query_embedding) as similarity
  from public.memory_entries me
  where me.owner_id = owner
    and me.embedding is not null
    and me.scope = 'global'
  order by me.embedding <=> query_embedding asc
  limit match_count;
$$;
