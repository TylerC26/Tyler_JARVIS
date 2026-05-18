-- 0028 // skill_usages
-- Records one row per (skill, chat turn) when the skill was injected into the
-- prompt and a judge LLM call evaluated the outcome. Powers a refinement
-- banner in the skills UI when a skill accumulates consecutive 'harmful'
-- outcomes.

do $$ begin
  create type skill_usage_outcome as enum ('useful', 'neutral', 'harmful');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.skill_usages (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  skill_id        uuid not null references public.skills(id) on delete cascade,
  outcome         skill_usage_outcome not null,
  critique        text,
  user_text       text,
  assistant_text  text,
  created_at      timestamptz not null default now()
);

create index if not exists skill_usages_skill_created_idx
  on public.skill_usages (skill_id, created_at desc);

create index if not exists skill_usages_owner_created_idx
  on public.skill_usages (owner_id, created_at desc);

alter table public.skill_usages disable row level security;
