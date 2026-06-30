-- Link notes to a project so notes captured in chat (save_note) or written in
-- /notes can be surfaced on a project's detail page, alongside meeting notes.
-- Nullable + on delete set null: a note can be unattached (the default) and
-- survives its project being deleted (it falls back to the global /notes pool).
--
-- RLS already covers this table (owner-scoped, migration 0032); a new nullable
-- column needs no policy change.

alter table public.notes
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists notes_owner_project_idx
  on public.notes (owner_id, project_id) where project_id is not null;
