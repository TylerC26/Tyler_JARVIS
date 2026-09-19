-- 0069: make the cron dispatcher lossless.
--
-- Three defects this fixes, all in app/api/cron/route.ts + markCronJobRanCore:
--
-- 1. WORK WAS LOST ON FAILURE. next_run_at was advanced BEFORE the job ran (as
--    a double-fire mitigation). A job that threw had already been marked as
--    run: no retry, no failure record, no trace. The {ran, failed} counts in
--    the HTTP response went nowhere, and last_run_at is overwritten each time,
--    so there was no execution history at all.
--
-- 2. NO MUTUAL EXCLUSION. markCronJobRanCore was a blind UPDATE ... WHERE id,
--    with no compare-and-swap. Vercel cron delivery is at-least-once and
--    maxDuration (300s) far exceeds the every-minute schedule, so two
--    invocations could select the same due row and both proceed.
--
-- 3. It also dropped the owner_id filter that every other function in that
--    file carries.
--
-- cron_runs gives every attempt a row. claim_cron_job makes starting one
-- exclusive. The lease expires so a crashed invocation can't park a job
-- forever — 10 minutes, comfortably longer than the 300s function ceiling.

alter table public.cron_jobs
  add column if not exists claimed_at timestamptz;

create table if not exists public.cron_runs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,
  job_id       uuid not null references public.cron_jobs(id) on delete cascade,
  status       text not null default 'running'
               check (status in ('running','succeeded','failed')),
  attempt      int  not null default 1,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text,
  output       text
);

create index if not exists cron_runs_owner_started
  on public.cron_runs (owner_id, started_at desc);

create index if not exists cron_runs_job_started
  on public.cron_runs (job_id, started_at desc);

-- Atomic claim. Returns true only for the caller that wins the race.
--
-- The next_run_at equality check makes the claim a compare-and-swap against
-- the exact occurrence the caller intends to run, so a job already advanced by
-- a concurrent invocation is refused. The claimed_at predicate is what makes it
-- mutually exclusive: the winning UPDATE sets it, and a second caller then
-- matches zero rows.
create or replace function public.claim_cron_job(
  p_job_id uuid,
  p_owner text,
  p_expected_next timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.cron_jobs
     set claimed_at = now()
   where id = p_job_id
     and owner_id = p_owner
     and active = true
     and next_run_at is not distinct from p_expected_next
     and (claimed_at is null or claimed_at < now() - interval '10 minutes');

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- RLS — same shape as every other table (see migration 0032).
alter table public.cron_runs enable row level security;

drop policy if exists cron_runs_owner_all on public.cron_runs;
create policy cron_runs_owner_all on public.cron_runs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
