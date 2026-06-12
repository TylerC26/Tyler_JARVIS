-- PRIVATE storage bucket for body-progress photos. Deliberately breaks the
-- pattern of the other buckets (meal-photos 0037, meeting-recordings 0043,
-- chat-uploads 0048, all public-read): progress photos are the most personal
-- media in the app, so there is NO public-read policy. public=false means
-- getPublicUrl() URLs 400; access is only via short-lived signed URLs minted
-- server-side with the service-role key (lib/storage/progress-photos.ts).
--
-- The size/MIME caps duplicate the app-side validation as server-side
-- enforcement — anything talking storage directly gets the same limits.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 10485760, '{image/*}')
  on conflict (id) do nothing;

-- No storage.objects policies on purpose: with RLS on storage.objects and no
-- permissive policy for this bucket, the anon key can neither read nor write;
-- the server's service-role key bypasses RLS for uploads and signing.
