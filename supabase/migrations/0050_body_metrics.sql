-- Body metrics: weight, body-fat % and progress-photo references over time —
-- one row per reading. This is the canonical store for body composition going
-- forward (an older weight_logs table still exists in the schema but has no
-- app code paths; it is left untouched here).
--
-- bf_percent is nullable because most readings are weight-only — scales report
-- weight every time but body fat only when measured. photo_ids are soft uuid
-- references (Postgres can't enforce FKs across array elements); the photo
-- store they point into ships with the UI phase later.

create table if not exists public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  weight_kg   numeric not null check (weight_kg > 0),
  bf_percent  numeric check (bf_percent >= 0 and bf_percent <= 100),
  photo_ids   uuid[],
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Primary read path: one owner's readings by time (trend charts, latest value).
create index if not exists body_metrics_user_recorded
  on public.body_metrics (user_id, recorded_at desc);

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.body_metrics enable row level security;

drop policy if exists body_metrics_owner_all on public.body_metrics;
create policy body_metrics_owner_all on public.body_metrics
  for all to public
  using (user_id::text = (auth.uid())::text)
  with check (user_id::text = (auth.uid())::text);
