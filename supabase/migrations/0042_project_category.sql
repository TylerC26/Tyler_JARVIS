-- 0042 // projects.category
-- Splits the projects dashboard into "work" projects vs "other" (side-hustle /
-- personal) ventures so each can be filtered independently. Free choice of two
-- buckets; defaults to 'other' to match the dashboard's original side-business
-- framing, so every pre-existing project lands under "Others" until re-tagged.

alter table public.projects
  add column if not exists category text not null default 'other'
    check (category in ('work', 'other'));

create index if not exists projects_owner_category_idx
  on public.projects (owner_id, category);
