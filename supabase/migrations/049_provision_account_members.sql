-- Allow trusted server-side member provisioning to attach a new Auth user
-- directly to an existing account. Provisioning claims are written only via
-- the Supabase Admin API into raw_app_meta_data; public signup metadata cannot
-- select a tenant or role.

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
  v_provision_account_id UUID;
  v_provision_role TEXT;
BEGIN
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, '');
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

  IF NULLIF(NEW.raw_app_meta_data->>'member_provisioning_account_id', '') IS NOT NULL THEN
    v_provision_account_id := (NEW.raw_app_meta_data->>'member_provisioning_account_id')::UUID;
    v_provision_role := NEW.raw_app_meta_data->>'member_provisioning_role';

    IF v_provision_role NOT IN ('admin', 'agent', 'viewer') THEN
      RAISE EXCEPTION 'Invalid provisioned account role';
    END IF;

    PERFORM 1 FROM public.accounts WHERE id = v_provision_account_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Provisioning target account not found';
    END IF;

    INSERT INTO public.profiles (
      user_id, full_name, email, avatar_url, account_id, account_role
    ) VALUES (
      NEW.id, v_full_name, NEW.email, v_avatar_url,
      v_provision_account_id, v_provision_role::account_role_enum
    );

    RETURN NEW;
  END IF;

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (
    user_id, full_name, email, avatar_url, account_id, account_role
  ) VALUES (
    NEW.id, v_full_name, NEW.email, v_avatar_url, v_account_id, 'owner'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
