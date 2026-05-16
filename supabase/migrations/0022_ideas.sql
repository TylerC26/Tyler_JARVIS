-- Lightweight scratchpad of ideas. Sits upstream of tasks/projects/memory:
-- rough thoughts the user can pin, edit, browse, and eventually "promote"
-- into a Task or Project (which stamps promoted_to_*_id + archived_at).

create table if not exists public.ideas (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 text not null,
  title                    text not null,
  body                     text not null default '',
  pinned                   boolean not null default false,
  archived_at              timestamptz,
  promoted_to_task_id      uuid,
  promoted_to_project_id   uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz
);

-- Default sort: not-yet-archived, pinned first, newest first.
create index if not exists ideas_owner_active
  on public.ideas (owner_id, archived_at, pinned desc, created_at desc);

create index if not exists ideas_owner_recent
  on public.ideas (owner_id, created_at desc);
