-- Cleanup metadata for failed tasks. When a user clicks "cancel" on a failed
-- task in the UI, we stamp cleanup_requested_at. The Mac daemon picks it up
-- via Realtime, stashes any dirty work, hard-resets the working tree, deletes
-- the leftover jarvis/* branch, and stamps cleanup_done_at or cleanup_error.

alter table public.repo_tasks
  add column if not exists cleanup_requested_at timestamptz,
  add column if not exists cleanup_done_at      timestamptz,
  add column if not exists cleanup_error        text;
