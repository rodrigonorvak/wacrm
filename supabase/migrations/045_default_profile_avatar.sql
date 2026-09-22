-- Use the identity provider avatar when available and fall back to Gravatar.
-- User-uploaded avatars remain unchanged because only NULL values are filled.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_avatar_url := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
    NULLIF(NEW.raw_user_meta_data->>'picture', ''),
    NULLIF(NEW.raw_user_meta_data->>'image_url', ''),
    CASE
      WHEN NEW.email IS NOT NULL THEN
        'https://www.gravatar.com/avatar/' || md5(lower(trim(NEW.email))) || '?d=mp&s=256'
      ELSE NULL
    END
  );

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, avatar_url, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_avatar_url, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

UPDATE public.profiles
SET avatar_url = 'https://www.gravatar.com/avatar/' || md5(lower(trim(email))) || '?d=mp&s=256'
WHERE avatar_url IS NULL
  AND email IS NOT NULL;
