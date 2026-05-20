-- Security fix: enable Row-Level Security on every table in the public schema.
--
-- Background: the app ships the Supabase anon key to the browser via
-- NEXT_PUBLIC_SUPABASE_ANON_KEY. With RLS disabled, that public key had full
-- read/write/delete access to every table — anyone with the project URL could
-- dump or wipe all data (Supabase advisories rls_disabled_in_public and
-- sensitive_columns_exposed).
--
-- Fix: enable RLS on all 28 tables. The server now connects with the
-- SERVICE-ROLE key (see lib/supabase/server.ts), which bypasses RLS, so the
-- app keeps full access. The anon key falls under RLS — and since there is no
-- Supabase Auth session, auth.uid() is null, so the owner_id = auth.uid()
-- policies match nothing and the public key is fully locked out. Default-deny
-- (RLS on, no permissive policy) is exactly the goal here.
--
-- The owner-scoped policies are kept / added for forward-compatibility: when
-- real multi-user auth lands they begin enforcing per-user isolation with no
-- further migration.

-- 1. Enable RLS on every public table.
alter table public.agents             enable row level security;
alter table public.ai_briefs          enable row level security;
alter table public.ai_suggestions     enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.cron_jobs          enable row level security;
alter table public.events             enable row level security;
alter table public.health_profile     enable row level security;
alter table public.ideas              enable row level security;
alter table public.memory_entries     enable row level security;
alter table public.mood_logs          enable row level security;
alter table public.notes              enable row level security;
alter table public.profiles           enable row level security;
alter table public.project_milestones enable row level security;
alter table public.projects           enable row level security;
alter table public.prompt_settings    enable row level security;
alter table public.repo_tasks         enable row level security;
alter table public.site_settings      enable row level security;
alter table public.skill_usages       enable row level security;
alter table public.skills             enable row level security;
alter table public.sleep_logs         enable row level security;
alter table public.tasks              enable row level security;
alter table public.telegram_updates   enable row level security;
alter table public.usage_events       enable row level security;
alter table public.weight_logs        enable row level security;
alter table public.wife_shifts        enable row level security;
alter table public.workout_exercises  enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.workout_sets       enable row level security;

-- 2. Add the standard owner-scoped policy to the tables that were missing one,
--    matching the owner_id = auth.uid() pattern used on the older tables. Both
--    sides are cast to text because owner_id is text on these newer tables
--    while auth.uid() returns uuid.
--    telegram_updates is intentionally skipped — it has no owner_id column, so
--    it stays default-deny under RLS (server still reaches it via service role).
drop policy if exists cron_jobs_owner_all on public.cron_jobs;
create policy cron_jobs_owner_all on public.cron_jobs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists ideas_owner_all on public.ideas;
create policy ideas_owner_all on public.ideas
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists notes_owner_all on public.notes;
create policy notes_owner_all on public.notes
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists repo_tasks_owner_all on public.repo_tasks;
create policy repo_tasks_owner_all on public.repo_tasks
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists site_settings_owner_all on public.site_settings;
create policy site_settings_owner_all on public.site_settings
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists skill_usages_owner_all on public.skill_usages;
create policy skill_usages_owner_all on public.skill_usages
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

drop policy if exists usage_events_owner_all on public.usage_events;
create policy usage_events_owner_all on public.usage_events
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);
