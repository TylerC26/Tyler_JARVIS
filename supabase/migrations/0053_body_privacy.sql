-- Body privacy hardening: belt-and-braces ACL for body_metrics (0050) and
-- progress_photos (0052). Both tables already ship owner-scoped RLS; this
-- migration makes the posture explicit and drift-proof:
--
--   1. FORCE row level security — policies bind even the table owner role,
--      so a future role/grant mistake can't quietly bypass them. The server's
--      service-role key is unaffected (BYPASSRLS attribute, not ownership).
--   2. Revoke every table privilege from anon/authenticated. RLS already
--      default-denies them (no auth session → auth.uid() is null), but with
--      zero grants the tables are unreachable for those roles even if a
--      permissive policy ever lands by accident.
--   3. Re-assert the owner policies idempotently: owner = user_id, both
--      USING and WITH CHECK, so no cross-user read OR write.
--
-- Storage side: the progress-photos bucket (0051) stays private with NO
-- storage.objects policies — anon can neither list nor read; all access is
-- service-role + short-lived signed URLs, owner-gated in
-- lib/storage/progress-photos.ts. Nothing here touches the notes table or any
-- other storage bucket — body data stays fully isolated from them.

alter table public.body_metrics    enable row level security;
alter table public.body_metrics    force  row level security;
alter table public.progress_photos enable row level security;
alter table public.progress_photos force  row level security;

revoke all on table public.body_metrics    from anon, authenticated;
revoke all on table public.progress_photos from anon, authenticated;

drop policy if exists body_metrics_owner_all on public.body_metrics;
create policy body_metrics_owner_all on public.body_metrics
  for all to public
  using (user_id::text = (auth.uid())::text)
  with check (user_id::text = (auth.uid())::text);

drop policy if exists progress_photos_owner_all on public.progress_photos;
create policy progress_photos_owner_all on public.progress_photos
  for all to public
  using (user_id::text = (auth.uid())::text)
  with check (user_id::text = (auth.uid())::text);
