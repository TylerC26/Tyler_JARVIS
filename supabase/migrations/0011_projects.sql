-- 0011 // projects + project_milestones + tasks.project_id
-- Tyler runs several side-business projects. We track each one's name, status,
-- description, and dates in `projects`; "big rocks" in `project_milestones`;
-- and tag tasks to a project via a nullable `project_id` on the existing
-- `tasks` table. Personal tasks stay un-tagged.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  name        text not null,
  slug        text not null,
  description text,
  status      text not null default 'active'
              check (status in ('idea','active','paused','shipped','archived')),
  color       text,
  started_at  date,
  target_date date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  unique (owner_id, slug)
);

create index if not exists projects_owner_status_idx
  on public.projects (owner_id, status);

create table if not exists public.project_milestones (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         text not null,
  description   text,
  target_date   date,
  completed_at  timestamptz,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create index if not exists project_milestones_project_idx
  on public.project_milestones (project_id, position);

alter table public.tasks
  add column if not exists project_id uuid
    references public.projects(id) on delete set null;

create index if not exists tasks_project_idx
  on public.tasks (project_id) where project_id is not null;

-- v1 single-user pattern (matches skills / wife_shifts / etc).
alter table public.projects           disable row level security;
alter table public.project_milestones disable row level security;

drop policy if exists "projects_owner_all" on public.projects;
create policy "projects_owner_all" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "project_milestones_owner_all" on public.project_milestones;
create policy "project_milestones_owner_all" on public.project_milestones
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
