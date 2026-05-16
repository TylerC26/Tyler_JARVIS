-- Queue of natural-language coding instructions for the Mac-side agent.
-- Jarvis (Vercel) inserts queued rows; a daemon on Tyler's Mac subscribes via
-- Realtime, atomically claims a row via claim_repo_task(), runs `claude -p`
-- inside repo_path on a fresh `jarvis/*` branch, and reports back.

create table if not exists public.repo_tasks (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             text not null,
  status               text not null default 'queued'
                       check (status in ('queued','claimed','running','succeeded','failed','cancelled')),
  repo_path            text not null,
  instruction          text not null,
  branch               text,
  base_branch          text,
  agent                text not null default 'claude-code'
                       check (agent in ('claude-code','opencode')),
  logs                 text,
  result               text,
  diff_summary         text,
  diff_files_changed   int,
  commit_sha           text,
  error                text,
  chat_message_id      uuid,
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  queued_at            timestamptz not null default now(),
  claimed_at           timestamptz,
  started_at           timestamptz,
  finished_at          timestamptz
);

create index if not exists repo_tasks_owner_status_queued
  on public.repo_tasks (owner_id, status, queued_at desc);

create index if not exists repo_tasks_owner_recent
  on public.repo_tasks (owner_id, queued_at desc);

-- Atomic claim: only one daemon (or one Realtime delivery) can flip a queued
-- row to claimed. Returns true if this caller won the race.
create or replace function public.claim_repo_task(p_task_id uuid, p_owner text)
returns boolean
language plpgsql
as $$
declare
  affected int;
begin
  update public.repo_tasks
  set status = 'claimed', claimed_at = now()
  where id = p_task_id
    and owner_id = p_owner
    and status = 'queued';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- Stream INSERTs to the Mac daemon over wss.
alter publication supabase_realtime add table public.repo_tasks;
