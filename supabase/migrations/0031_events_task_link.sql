-- 0031 // events.task_id
-- Optional FK from a calendar event to a single task. Used by the calendar UI
-- to render events whose linked task is done with a strikethrough/dim style.
-- ON DELETE SET NULL so deleting a task leaves the event intact, just unlinked.

alter table public.events
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists events_task_id_idx
  on public.events (task_id)
  where task_id is not null;
