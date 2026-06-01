-- Agent run log: one row per sub-agent invocation. Written by runAgent() at
-- dispatch (status='running') and updated on completion (status='done'|'error').
--
-- This is the heartbeat the dashboard "Agent Ops Board" (TerminalOffice) reads.
-- The board short-polls recent rows and lights up the node-graph whenever an
-- agent fires — whether the delegation originated from a web /chat turn or a
-- Telegram-fed orchestrator turn, since both paths funnel through runAgent.
--
-- trigger_source and status are soft enums on the app side (no CHECK) so new
-- sources ('cron', 'api') or states can be added without a migration.

create table if not exists public.agent_runs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         text not null,
  agent_slug       text not null,
  agent_name       text not null,
  agent_color      text,                                   -- hex accent for the node, e.g. '#00d9ff'
  trigger_source   text not null default 'chat',           -- chat / telegram / cron / api (free-form)
  task             text,                                   -- short task string the orchestrator handed off
  status           text not null default 'running',        -- running / done / error (free-form)
  tool_calls_count integer not null default 0,
  tool_calls       jsonb not null default '[]'::jsonb,     -- [toolName, ...] the sub-agent invoked
  result_summary   text,                                   -- trimmed final text or error message
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

-- Primary read path for the board: most-recent-first within the owner.
create index if not exists agent_runs_owner_started
  on public.agent_runs (owner_id, started_at desc);

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.agent_runs enable row level security;

drop policy if exists agent_runs_owner_all on public.agent_runs;
create policy agent_runs_owner_all on public.agent_runs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
