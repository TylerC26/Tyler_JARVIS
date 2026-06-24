-- Per-call-site LLM model overrides. One row per (owner, feature_key) the user
-- has pinned; an absent row means 'auto' (use the call-site's coded default).
-- Sibling of site_settings/prompt_settings — runtime model selection rather
-- than kill switches or prompt text.

create table if not exists public.model_prefs (
  owner_id    text not null,
  feature_key text not null,
  model_pref  text not null default 'auto',
  updated_at  timestamptz,
  primary key (owner_id, feature_key)
);

-- RLS — same shape as every other table (see migration 0050). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.model_prefs enable row level security;
drop policy if exists model_prefs_owner_all on public.model_prefs;
create policy model_prefs_owner_all on public.model_prefs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

-- Per-cron-job model pin. 'auto' keeps the classifier/global-pin behavior.
alter table public.cron_jobs
  add column if not exists model_pref text not null default 'auto';
