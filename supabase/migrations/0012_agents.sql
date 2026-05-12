-- 0012 // agents
-- Named sub-AIs that Jarvis (the orchestrator) can delegate to via the
-- `delegate_to_agent` tool. Each agent carries its own system prompt and a
-- tool_allowlist (subset of ALL_TOOLS keys). Runtime spins up a small isolated
-- streamText loop with just those tools, returns the final text to Jarvis.
--
-- Seeded agents are inserted on first load by `seedDefaultAgentsCore()` and are
-- marked `source = 'seeded'`. Custom user agents are `source = 'manual'`.

create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  name            text not null,
  slug            text not null,
  description     text not null,
  system_prompt   text not null,
  tool_allowlist  text[] not null default '{}',
  model_pref      text not null default 'claude'
    check (model_pref in ('claude', 'deepseek', 'auto')),
  color           text,
  active          boolean not null default true,
  source          text not null default 'manual'
    check (source in ('manual', 'seeded')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (owner_id, slug)
);

create index if not exists agents_owner_active_idx
  on public.agents (owner_id, active);

-- Single-user v1 — RLS disabled like other tables in this app.
alter table public.agents disable row level security;

drop policy if exists "agents_owner_all" on public.agents;
create policy "agents_owner_all" on public.agents
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
