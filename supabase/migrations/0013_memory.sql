-- 0013 // memory
-- Persistent fact store that Jarvis and sub-agents read/write via the
-- `remember` and `forget` tools. Top-N entries (pinned first, then most
-- recently used) are injected into the system prefix every chat turn so Jarvis
-- "remembers" across conversations.
--
-- v1 surface: manual writes via tool calls + a stub auto-extractor at the end
-- of each chat turn that initially no-ops but reserves the wiring point.

create table if not exists public.memory_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  scope         text not null default 'global',
  -- 'global' = visible to Jarvis and every agent.
  -- 'agent:<slug>' = scoped to a single agent (reserved for v2).
  kind          text not null check (kind in ('fact', 'preference', 'context')),
  key           text not null,
  value         text not null,
  source        text not null check (source in ('user', 'extracted', 'agent')),
  confidence    text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  pinned        boolean not null default false,
  used_count    int not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists memory_owner_scope_idx
  on public.memory_entries (owner_id, scope);

-- Composite for the prefix injection query: pinned first, then by recency.
create index if not exists memory_owner_pinned_recency_idx
  on public.memory_entries (owner_id, pinned desc, last_used_at desc nulls last);

alter table public.memory_entries disable row level security;

drop policy if exists "memory_owner_all" on public.memory_entries;
create policy "memory_owner_all" on public.memory_entries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
