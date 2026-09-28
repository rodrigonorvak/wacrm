-- Store customer-sent WhatsApp attachments privately.
-- Outbound media remains in chat-media because Meta must fetch its URL.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-inbound',
  'chat-inbound',
  FALSE,
  16777216,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp', 'video/3gp', 'video/quicktime',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'audio/ogg', 'audio/mpeg', 'audio/aac', 'audio/mp4', 'audio/amr', 'audio/opus'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Account members can read inbound chat media" ON storage.objects;
CREATE POLICY "Account members can read inbound chat media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-inbound'
    AND (storage.foldername(name))[2] = 'inbound'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

COMMENT ON POLICY "Account members can read inbound chat media" ON storage.objects IS
  'Private inbound attachments are readable only by members of the account encoded in the object path.';
