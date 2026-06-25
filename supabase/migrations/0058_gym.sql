-- Gym training log: structured strength data fed by Matt (the personal-trainer
-- agent) via the log_workout chat tool. Previously lifts were only captured as
-- free-text "gym-sessions" notes (see lib/ai/physique/synthesize.ts), which
-- can't drive per-exercise progression charts. This pair of tables stores the
-- sets/reps/weight in a queryable shape so /gym can render progression lines
-- and an attendance heat map.
--
-- gym_sessions  = one training session (also = one attendance day on the heat map).
-- gym_exercise_logs = one exercise within a session, with its sets as jsonb plus
-- pre-computed summary columns (top set / est. 1RM / volume) so charts need no
-- per-row math or joins.

create table if not exists public.gym_sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     text not null,
  performed_at timestamptz not null default now(),   -- when the session happened
  title        text,                                 -- e.g. "Push day" (free-form, optional)
  notes        text,                                 -- Matt's session notes / Tyler's remarks
  source       text not null default 'matt',         -- matt / manual / apple_watch (future)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- Primary read path for /gym: most-recent sessions, and attendance aggregation.
create index if not exists gym_sessions_owner_performed
  on public.gym_sessions (owner_id, performed_at desc);

create table if not exists public.gym_exercise_logs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        text not null,
  session_id      uuid not null references public.gym_sessions (id) on delete cascade,
  exercise        text not null,                       -- display name, e.g. "Bench Press"
  exercise_slug   text not null,                       -- normalized key for grouping, e.g. "bench-press"
  sets            jsonb not null default '[]'::jsonb,   -- [{reps, weight_kg, rpe?, warmup?}]
  top_weight_kg   numeric,                              -- heaviest working set's load
  est_1rm_kg      numeric,                              -- Epley on the top set: w * (1 + reps/30)
  total_volume_kg numeric,                              -- sum(reps * weight_kg) across working sets
  performed_at    timestamptz not null,                 -- denormalized from the session for cheap time-series
  created_at      timestamptz not null default now()
);

-- Progression read path: one exercise's loads over time.
create index if not exists gym_logs_owner_exercise_performed
  on public.gym_exercise_logs (owner_id, exercise_slug, performed_at desc);

-- Session-scoped lookups + general owner timeline.
create index if not exists gym_logs_owner_performed
  on public.gym_exercise_logs (owner_id, performed_at desc);

create index if not exists gym_logs_session
  on public.gym_exercise_logs (session_id);

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.gym_sessions enable row level security;
alter table public.gym_exercise_logs enable row level security;

drop policy if exists gym_sessions_owner_all on public.gym_sessions;
create policy gym_sessions_owner_all on public.gym_sessions
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists gym_exercise_logs_owner_all on public.gym_exercise_logs;
create policy gym_exercise_logs_owner_all on public.gym_exercise_logs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
