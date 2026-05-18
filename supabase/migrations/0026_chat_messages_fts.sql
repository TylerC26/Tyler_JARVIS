-- 0026 // chat_messages full-text search
-- Adds a generated tsvector column and a GIN index so the new
-- `search_past_conversations` tool can query historical chat content
-- with plainto_tsquery + ts_rank. Backfills automatically via the
-- generated column expression.

alter table public.chat_messages
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists chat_messages_content_fts_idx
  on public.chat_messages using gin (content_tsv);
