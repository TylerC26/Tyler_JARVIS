-- 0033 // memory redesign
-- Evolves memory_entries from a flat, recency-only store into a structured,
-- self-curating long-term memory:
--   * status         — soft lifecycle (active / archived / superseded) instead
--                       of hard deletes, so the UI keeps history and the
--                       `forget` tool is recoverable.
--   * superseded_by   — when a fact is corrected, the stale row points at its
--                       replacement instead of vanishing.
--   * details         — jsonb expansion slot for structured metadata (dates,
--                       related entities) with no further migration needed.
--   * kind            — the rigid 3-value CHECK is dropped; the conventional
--                       category set now lives in app code (lib/db/types.ts:
--                       MEMORY_KINDS) so it can grow without a migration.
-- Plus two RPCs: a shape-decoupled match_memories (returns id + similarity
-- only, so column changes never force a re-spec) and bump_memory_usage for
-- atomic used_count increments.
--
-- Additive + idempotent. RLS already enabled on memory_entries (0032); the
-- server reaches it via the service-role key.

-- 1. New lifecycle / structure columns.
alter table public.memory_entries
  add column if not exists status text not null default 'active'
    check (status in ('active', 'archived', 'superseded')),
  add column if not exists superseded_by uuid
    references public.memory_entries (id) on delete set null,
  add column if not exists details jsonb not null default '{}'::jsonb;

-- 2. kind becomes free-form (governed by the app-layer enum). Drop the rigid
--    3-value CHECK and fold legacy 'fact' rows into the new 'knowledge'
--    category so they stay inside the conventional set.
alter table public.memory_entries
  drop constraint if exists memory_entries_kind_check;
update public.memory_entries set kind = 'knowledge' where kind = 'fact';

-- 3. Index for the active-status prefix / list queries.
create index if not exists memory_owner_status_idx
  on public.memory_entries (owner_id, status, scope);

-- 4. Semantic match RPC. Returns id + similarity only — decoupled from the
--    table's column list, so future column changes never force a re-spec.
--    The prior version returned the full row; drop every overload by name
--    (regardless of how its arg types are registered) so the new return
--    signature can be created cleanly.
do $$
declare fn record;
begin
  for fn in
    select oid::regprocedure::text as sig
    from pg_proc
    where proname = 'match_memories'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || fn.sig;
  end loop;
end $$;

create function public.match_memories(
  query_embedding extensions.vector(1536),
  owner uuid,
  match_count int
)
returns table (id uuid, similarity double precision)
language sql
stable
as $$
  select me.id, 1 - (me.embedding <=> query_embedding) as similarity
  from public.memory_entries me
  where me.owner_id = owner
    and me.status = 'active'
    and me.embedding is not null
  order by me.embedding <=> query_embedding asc
  limit match_count;
$$;

-- 5. Atomic usage bump — fixes the long-standing used_count that never
--    incremented, and stamps last_used_at, in a single round-trip.
create or replace function public.bump_memory_usage(ids uuid[])
returns void
language sql
volatile
as $$
  update public.memory_entries
  set used_count = used_count + 1,
      last_used_at = now()
  where id = any(ids);
$$;
