-- 0009 // skills
-- User-authored behavior bundles. Each skill carries a system-prompt fragment
-- (`instructions`) that gets inlined into the chat context prefix when the
-- user's message matches any of the skill's `trigger_keywords`. Skills are
-- editable from /skills and can also be authored by Jarvis itself via the
-- `create_skill` tool.
--
-- v1 keeps activation simple: keyword-substring match on the latest user
-- message. A semantic fallback can be layered on later through the existing
-- DeepSeek classifier.

create table if not exists public.skills (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null,
  name              text not null,
  description       text not null,
  instructions      text not null,
  trigger_keywords  text[] not null default '{}',
  active            boolean not null default true,
  source            text not null default 'manual'
    check (source in ('manual', 'seeded', 'jarvis')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (owner_id, name)
);

create index if not exists skills_owner_active_idx
  on public.skills (owner_id, active);

-- Match the v1 single-user pattern (events / wife_shifts / chat_messages).
alter table public.skills disable row level security;

drop policy if exists "skills_owner_all" on public.skills;
create policy "skills_owner_all" on public.skills
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
