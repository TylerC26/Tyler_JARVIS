-- 0070: reviews — plan versus actual.
--
-- The system only ever looked forward. gatherContext() builds a snapshot of
-- what is due; nothing anywhere records what actually happened against it, so
-- the memory store can only grow and is never contradicted by outcome.
--
-- This is also the table the evening brief has been promising for a while
-- without one. DEFAULT_EVENING_BRIEF_PROMPT (lib/ai/engine/claude.ts:81) asks
-- for "completion stats, what shipped, tomorrow's load, overdue status" and
-- states its inputs are "what was closed today, and tomorrow's pending
-- priority load" — but AIContext never computed any of that, so the evening
-- engine received the identical morning snapshot. Any completion figure it
-- emitted was invented.
--
-- planned is captured when the morning brief runs; actual when the day closes.
-- The diff between them is the corrective signal that has never existed.

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  owner_id      text not null,

  kind          text not null check (kind in ('evening','weekly','monthly')),
  period_start  date not null,
  period_end    date not null,

  planned       jsonb,   -- snapshot taken at brief time
  actual        jsonb,   -- what closed, what moved, what arrived unplanned
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- One review per kind per period; re-running a close-out updates it rather
-- than stacking duplicates.
create unique index if not exists reviews_owner_kind_period
  on public.reviews (owner_id, kind, period_start);

create index if not exists reviews_owner_recent
  on public.reviews (owner_id, period_start desc);

-- RLS — same shape as every other table (see migration 0032).
alter table public.reviews enable row level security;

drop policy if exists reviews_owner_all on public.reviews;
create policy reviews_owner_all on public.reviews
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
