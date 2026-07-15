-- 0064_memory_topics.sql
-- Adds a TOPIC -> SUBTOPIC hierarchy to memory_entries (app-governed, like kind).
alter table public.memory_entries
  add column if not exists topic    text,
  add column if not exists subtopic text;

create index if not exists memory_owner_topic_idx
  on public.memory_entries (owner_id, topic, subtopic);

comment on column public.memory_entries.topic is
  'Top-level life-area grouping (app-governed slug; see MEMORY_TOPICS in lib/db/types.ts).';
comment on column public.memory_entries.subtopic is
  'Optional second-level grouping under topic.';
