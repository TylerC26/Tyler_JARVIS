-- 0004 // tasks

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null,
  title          text not null,
  description    text,
  status         text not null default 'todo' check (status in ('todo','doing','blocked','done')),
  priority       int  not null default 3 check (priority between 1 and 4),
  due_at         timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

create index if not exists tasks_owner_status_due_idx
  on public.tasks (owner_id, status, due_at);

alter table public.tasks disable row level security;

drop policy if exists "tasks_owner_all" on public.tasks;
create policy "tasks_owner_all" on public.tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
