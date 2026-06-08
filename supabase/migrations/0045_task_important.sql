-- 0045 // tasks.important
-- Adds an "important" flag so the Tasks board can surface a focused IMPORTANT
-- lane that lists only starred, still-open tasks. The OPEN column continues to
-- list every open task (important ones appear in both). Defaults to false so
-- every pre-existing task stays un-starred.

alter table public.tasks
  add column if not exists important boolean not null default false;

create index if not exists tasks_owner_important_idx
  on public.tasks (owner_id, important);
