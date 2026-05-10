-- 0001 // profiles
-- Single-user MVP. RLS policies authored, but row level security DISABLED.
-- Flip on with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` when ready.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone     text not null default 'America/Toronto',
  preferences  jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

alter table public.profiles disable row level security;

drop policy if exists "profiles_owner_select" on public.profiles;
create policy "profiles_owner_select" on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists "profiles_owner_upsert" on public.profiles;
create policy "profiles_owner_upsert" on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles
  for update using (user_id = auth.uid());
