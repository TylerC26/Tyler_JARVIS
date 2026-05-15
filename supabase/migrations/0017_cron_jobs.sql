create table if not exists public.cron_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null,
  name        text not null,
  description text,
  schedule    text not null,     -- standard 5-field cron expression (UTC)
  prompt      text not null,     -- sent to the Jarvis orchestrator when job fires
  active      boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,       -- pre-computed; used by the cron dispatcher
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cron_jobs_owner_active_next
  on public.cron_jobs (owner_id, active, next_run_at);
