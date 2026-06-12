-- Link tasks back to the meeting whose action items spawned them. Finalize no
-- longer auto-creates tasks — the meeting detail page's action-item card now
-- promotes items explicitly — and this column is how the card knows which
-- items are already promoted (and dedupes re-promotion). Nullable + on delete
-- set null: ordinary tasks have no meeting, and a task outlives its meeting.

alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings(id) on delete set null;

create index if not exists tasks_meeting_idx
  on public.tasks (meeting_id) where meeting_id is not null;
