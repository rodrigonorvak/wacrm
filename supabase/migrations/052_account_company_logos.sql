-- Per-account branding for the expanded sidebar logo.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'account-logos',
  'account-logos',
  TRUE,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Account logos are publicly readable" ON storage.objects;
CREATE POLICY "Account logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'account-logos');

DROP POLICY IF EXISTS "Account admins can upload company logos" ON storage.objects;
CREATE POLICY "Account admins can upload company logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'account-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.account_id::text
        AND public.is_account_member(p.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS "Account admins can update company logos" ON storage.objects;
CREATE POLICY "Account admins can update company logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'account-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.account_id::text
        AND public.is_account_member(p.account_id, 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'account-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.account_id::text
        AND public.is_account_member(p.account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS "Account admins can delete company logos" ON storage.objects;
CREATE POLICY "Account admins can delete company logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'account-logos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (storage.foldername(name))[1] = p.account_id::text
        AND public.is_account_member(p.account_id, 'admin')
    )
  );

COMMENT ON COLUMN public.accounts.logo_url IS
  'Public company logo URL used only while the application sidebar is expanded.';