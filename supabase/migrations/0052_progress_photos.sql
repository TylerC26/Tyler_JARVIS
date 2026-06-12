-- Progress photos: one row per body-progress photo living in the private
-- progress-photos bucket (migration 0051). storage_path is the object key in
-- that bucket — never a URL, because the bucket is private and URLs are minted
-- on demand. analysis holds the AI body-composition read of the photo (filled
-- in later by attachAnalysis); body_metric_id soft-links the photo to the
-- weigh-in it accompanies. Linkage is two-way with body_metrics.photo_ids
-- (0050) — the FK side is authoritative, the array side is a denormalized
-- convenience.

create table if not exists public.progress_photos (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  storage_path   text not null,
  taken_at       timestamptz not null,
  analysis       jsonb,
  body_metric_id uuid references public.body_metrics(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Primary read path: one owner's photos by time (gallery, before/after pairs).
create index if not exists progress_photos_user_taken
  on public.progress_photos (user_id, taken_at desc);

-- Joining photos to a weigh-in. Partial: most rows are expected to be unlinked.
create index if not exists progress_photos_body_metric
  on public.progress_photos (body_metric_id)
  where body_metric_id is not null;

-- RLS — same shape as every other table (see migration 0032). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.progress_photos enable row level security;

drop policy if exists progress_photos_owner_all on public.progress_photos;
create policy progress_photos_owner_all on public.progress_photos
  for all to public
  using (user_id::text = (auth.uid())::text)
  with check (user_id::text = (auth.uid())::text);
