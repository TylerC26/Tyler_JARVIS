-- 0010 // prompt_settings
-- One row per owner holding optional overrides for Jarvis's system prompts.
-- Each field is nullable / empty-string-tolerant — when blank, the chat code
-- falls back to the hard-coded default. Editing happens on /settings.

create table if not exists public.prompt_settings (
  owner_id              uuid primary key,
  orchestrator_prompt   text,
  responder_prompt      text,
  prefix_addendum       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

-- Single-user v1 pattern (matches events / wife_shifts / chat_messages / skills).
alter table public.prompt_settings disable row level security;

drop policy if exists "prompt_settings_owner_all" on public.prompt_settings;
create policy "prompt_settings_owner_all" on public.prompt_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
