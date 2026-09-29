-- Keep profile avatars readable inside the owning account only.
-- Application clients now resolve stored avatar URLs through an authenticated
-- route that issues short-lived signed URLs after checking account membership.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  FALSE,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Account members can read profile avatars" ON storage.objects;
CREATE POLICY "Account members can read profile avatars"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND array_length(storage.foldername(name), 1) = 2
    AND EXISTS (
      SELECT 1
      FROM public.profiles owner_profile
      WHERE owner_profile.user_id::text = (storage.foldername(name))[1]
        AND is_account_member(owner_profile.account_id)
    )
  );

COMMENT ON POLICY "Account members can read profile avatars" ON storage.objects IS
  'A profile avatar is readable only by authenticated members of the avatar owner account.';
