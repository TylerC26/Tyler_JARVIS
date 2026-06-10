-- Image upload + OCR for /chat. Users can attach images to a chat turn; the
-- image is re-hosted here so it survives reloads and can be passed to vision /
-- OCR tools by URL. Mirrors the meal-photos setup (migration 0037): a public
-- bucket (so <img src=…> works for the single owner) with server-only writes via
-- the service-role key. Rolled out to the work-assistant agent (Claudia) first.

-- Per-message attachment metadata: [{url, mediaType, filename?}]. Lets the chat
-- thread rehydrate image parts on reload (chat_messages.content stays text-only).
alter table public.chat_messages
  add column if not exists attachments jsonb;

-- Storage bucket for chat image uploads. Public read; writes are server-only
-- (service-role key bypasses RLS). The bucket id is the stable handle.
insert into storage.buckets (id, name, public)
  values ('chat-uploads', 'chat-uploads', true)
  on conflict (id) do nothing;

-- Allow public read so <img src=…> works for the owner-only single-user app.
drop policy if exists chat_uploads_public_read on storage.objects;
create policy chat_uploads_public_read on storage.objects
  for select to public
  using (bucket_id = 'chat-uploads');
