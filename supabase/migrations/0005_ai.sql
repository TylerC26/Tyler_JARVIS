-- 0005 // ai_briefs + ai_suggestions
-- Placeholder engine v1 today; real Claude later. RLS authored, disabled.

create table if not exists public.ai_briefs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null,
  created_at       timestamptz not null default now(),
  kind             text not null check (kind in ('morning','evening')),
  for_date         date not null,
  engine           text not null default 'placeholder-v1',
  summary          text not null,
  bullets          jsonb not null default '[]'::jsonb,
  context_snapshot jsonb not null
);

create index if not exists ai_briefs_owner_for_date_idx
  on public.ai_briefs (owner_id, for_date desc, kind);

create table if not exists public.ai_suggestions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('productivity','spending','habit')),
  title       text not null,
  body        text not null,
  severity    text not null default 'info' check (severity in ('info','warn','crit')),
  evidence    jsonb,
  status      text not null default 'open' check (status in ('open','dismissed','acted')),
  brief_id    uuid references public.ai_briefs(id) on delete set null,
  expires_on  date
);

create index if not exists ai_suggestions_owner_status_idx
  on public.ai_suggestions (owner_id, status, created_at desc);

alter table public.ai_briefs      disable row level security;
alter table public.ai_suggestions disable row level security;

drop policy if exists "ai_briefs_owner_all" on public.ai_briefs;
create policy "ai_briefs_owner_all" on public.ai_briefs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ai_suggestions_owner_all" on public.ai_suggestions;
create policy "ai_suggestions_owner_all" on public.ai_suggestions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
