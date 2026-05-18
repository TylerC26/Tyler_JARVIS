-- Collapse task statuses from {todo, doing, blocked, done} → {todo, done}.
-- "doing" and "blocked" weren't pulling weight in the workflow — every open
-- task becomes "todo" and the only meaningful transition is todo↔done.

-- Drop the old check first so the bulk update can rewrite the rows without
-- tripping it. Then remap existing data, then add the tightened check.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks
   set status = 'todo'
 where status in ('doing', 'blocked');

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'done'));
