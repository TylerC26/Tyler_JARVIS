-- 0034 // pin search_path on the memory RPCs
-- Clears the `function_search_path_mutable` security advisory on the two
-- functions added in 0033 (match_memories, bump_memory_usage) by fixing their
-- search_path instead of inheriting the caller's. Both are SECURITY INVOKER so
-- the exposure was low, but a pinned path is the correct posture.
--
-- create-or-replace only (same return signatures as 0033) — no drop needed.

create or replace function public.match_memories(
  query_embedding extensions.vector(1536),
  owner uuid,
  match_count int
)
returns table (id uuid, similarity double precision)
language sql
stable
set search_path = extensions, public, pg_temp
as $$
  select me.id, 1 - (me.embedding <=> query_embedding) as similarity
  from public.memory_entries me
  where me.owner_id = owner
    and me.status = 'active'
    and me.embedding is not null
  order by me.embedding <=> query_embedding asc
  limit match_count;
$$;

create or replace function public.bump_memory_usage(ids uuid[])
returns void
language sql
volatile
set search_path = public, pg_temp
as $$
  update public.memory_entries
  set used_count = used_count + 1,
      last_used_at = now()
  where id = any(ids);
$$;
