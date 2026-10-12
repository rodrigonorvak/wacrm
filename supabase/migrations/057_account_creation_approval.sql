-- Gate new self-service accounts behind a platform-admin approval.
-- Existing profiles remain approved; invited members use the existing
-- provisioning path and are approved immediately.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (access_status IN ('pending', 'approved', 'denied', 'suspended'));

CREATE TABLE IF NOT EXISTS public.account_creation_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  denial_reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_creation_requests_status_created
  ON public.account_creation_requests(status, created_at DESC);

ALTER TABLE public.account_creation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_creation_requests_select_own
  ON public.account_creation_requests;
CREATE POLICY account_creation_requests_select_own
  ON public.account_creation_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS account_creation_requests_insert_own
  ON public.account_creation_requests;
CREATE POLICY account_creation_requests_insert_own
  ON public.account_creation_requests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS account_creation_requests_update_own
  ON public.account_creation_requests;
CREATE POLICY account_creation_requests_update_own
  ON public.account_creation_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP TRIGGER IF EXISTS set_updated_at ON public.account_creation_requests;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_creation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  v_company TEXT;
  v_phone TEXT;
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
  v_company := NULLIF(NEW.raw_user_meta_data->>'company', '');
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');

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
      user_id, full_name, email, avatar_url, account_id, account_role, access_status
    ) VALUES (
      NEW.id, v_full_name, NEW.email, v_avatar_url,
      v_provision_account_id, v_provision_role::account_role_enum, 'approved'
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(v_company, NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (
    user_id, full_name, email, avatar_url, account_id, account_role, access_status
  ) VALUES (
    NEW.id, v_full_name, NEW.email, v_avatar_url, v_account_id, 'owner', 'pending'
  );

  INSERT INTO public.account_creation_requests (
    user_id, account_id, full_name, email, company, phone
  ) VALUES (
    NEW.id, v_account_id, v_full_name, NEW.email,
    COALESCE(v_company, ''), COALESCE(v_phone, '')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

DROP FUNCTION IF EXISTS public.approve_account_creation_request(UUID, UUID);
CREATE OR REPLACE FUNCTION public.approve_account_creation_request(
  p_request_id UUID,
  p_decided_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.account_creation_requests;
BEGIN
  SELECT *
  INTO v_request
  FROM public.account_creation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.accounts
  SET name = v_request.company
  WHERE id = v_request.account_id;

  UPDATE public.profiles
  SET full_name = v_request.full_name,
      account_role = 'owner',
      access_status = 'approved'
  WHERE user_id = v_request.user_id
    AND account_id = v_request.account_id;

  UPDATE public.account_creation_requests
  SET status = 'approved',
      decided_by = p_decided_by,
      decided_at = NOW()
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.approve_account_creation_request(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_account_creation_request(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_account_creation_request(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND p.access_status = 'approved'
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END >= CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION public.is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, account_role_enum)
  TO authenticated, service_role;
