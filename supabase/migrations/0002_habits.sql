-- 0002 // habits + habit_logs

create table if not exists public.habits (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  name              text not null,
  cadence           text not null default 'daily' check (cadence in ('daily','weekly')),
  target_per_period int  not null default 1,
  color             text,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create index if not exists habits_owner_created_idx
  on public.habits (owner_id, created_at desc);

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  logged_on  date not null,
  count      int  not null default 1,
  note       text,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_on)
);

create index if not exists habit_logs_owner_logged_idx
  on public.habit_logs (owner_id, logged_on desc);

alter table public.habits      disable row level security;
alter table public.habit_logs  disable row level security;

drop policy if exists "habits_owner_all" on public.habits;
create policy "habits_owner_all" on public.habits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "habit_logs_owner_all" on public.habit_logs;
create policy "habit_logs_owner_all" on public.habit_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
