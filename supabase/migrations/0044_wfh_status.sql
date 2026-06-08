-- 0044 // wfh_status
-- Tyler's per-day work location, shown as a small day-header badge on the
-- calendar (next to the wife's shift badge). The assistant agent sets it via
-- the set_wfh_status / clear_wfh_status tools — e.g. "I'm WFH Mon–Wed".
-- Status codes:
--   wfh    = Working from home
--   office = In the office
--   pto    = Paid time off / leave
--   out    = Out of office (travelling, offsite, away)
--
-- One row per (owner, status_date). Re-setting the same day upserts in place.
-- Mirrors the wife_shifts table (0008) and the post-0032 RLS posture: RLS on,
-- owner-scoped policy. The server uses the service-role key (bypasses RLS); the
-- anon key has no auth session so the policy denies it (default-deny).

create table if not exists public.wfh_status (
  owner_id    uuid not null,
  status_date date not null,
  status      text not null check (status in ('wfh','office','pto','out')),
  note        text,
  source      text not null default 'agent',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  primary key (owner_id, status_date)
);

create index if not exists wfh_status_owner_date_idx
  on public.wfh_status (owner_id, status_date);

alter table public.wfh_status enable row level security;

drop policy if exists wfh_status_owner_all on public.wfh_status;
create policy wfh_status_owner_all on public.wfh_status
  for all to public
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
