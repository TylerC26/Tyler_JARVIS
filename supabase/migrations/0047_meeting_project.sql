-- Link meetings to a project so meeting notes captured by the Jarvis desktop
-- transcription pipeline (migration 0043) can be surfaced on a project's detail
-- page. Nullable + on delete set null: a meeting can be unattached (the default
-- for the capture pipeline) and survives its project being deleted.
--
-- RLS already covers this table (owner-scoped, migration 0043); a new nullable
-- column needs no policy change.

alter table public.meetings
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists meetings_project_idx
  on public.meetings (project_id) where project_id is not null;
