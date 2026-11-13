CREATE TABLE IF NOT EXISTS public.platform_admin_account_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_one_active_session_idx
  ON public.platform_admin_account_sessions(admin_user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS platform_admin_sessions_account_idx
  ON public.platform_admin_account_sessions(account_id, started_at DESC);

ALTER TABLE public.platform_admin_account_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_account_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admin_account_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.platform_admin_access_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.platform_admin_account_sessions(id) ON DELETE SET NULL,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  table_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admin_access_audit_account_idx
  ON public.platform_admin_access_audit(account_id, created_at DESC);

ALTER TABLE public.platform_admin_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_access_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admin_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin_account_session(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.platform_admin_account_sessions s
    JOIN public.platform_admins a ON a.user_id = s.admin_user_id
    WHERE s.admin_user_id = auth.uid()
      AND s.account_id = target_account_id
      AND s.ended_at IS NULL
      AND s.expires_at > now()
      AND a.role = 'super_admin'
      AND a.active = true
  );
$$;

ALTER FUNCTION public.is_platform_admin_account_session(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_platform_admin_account_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin_account_session(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS pipelines_platform_admin_support ON public.pipelines;
CREATE POLICY pipelines_platform_admin_support ON public.pipelines
  FOR ALL
  USING (public.is_platform_admin_account_session(account_id))
  WITH CHECK (public.is_platform_admin_account_session(account_id));

DROP POLICY IF EXISTS pipeline_stages_platform_admin_support ON public.pipeline_stages;
CREATE POLICY pipeline_stages_platform_admin_support ON public.pipeline_stages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND public.is_platform_admin_account_session(p.account_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND public.is_platform_admin_account_session(p.account_id)
    )
  );

CREATE OR REPLACE FUNCTION public.audit_platform_admin_account_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_account_id UUID;
  active_session_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'pipelines' THEN
    IF TG_OP = 'DELETE' THEN
      target_account_id := OLD.account_id;
    ELSE
      target_account_id := NEW.account_id;
    END IF;
  ELSE
    SELECT p.account_id INTO target_account_id
    FROM public.pipelines p
    WHERE p.id = CASE
      WHEN TG_OP = 'DELETE' THEN OLD.pipeline_id
      ELSE NEW.pipeline_id
    END;
  END IF;

  IF target_account_id IS NULL OR NOT public.is_platform_admin_account_session(target_account_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT s.id INTO active_session_id
  FROM public.platform_admin_account_sessions s
  WHERE s.admin_user_id = auth.uid()
    AND s.account_id = target_account_id
    AND s.ended_at IS NULL
    AND s.expires_at > now()
  ORDER BY s.started_at DESC
  LIMIT 1;

  INSERT INTO public.platform_admin_access_audit (
    session_id, admin_user_id, account_id, action, table_name
  ) VALUES (
    active_session_id,
    auth.uid(),
    target_account_id,
    lower(TG_OP),
    TG_TABLE_NAME
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.audit_platform_admin_account_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.audit_platform_admin_account_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS platform_admin_audit_pipeline_changes ON public.pipelines;
CREATE TRIGGER platform_admin_audit_pipeline_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_admin_account_change();

DROP TRIGGER IF EXISTS platform_admin_audit_pipeline_stage_changes ON public.pipeline_stages;
CREATE TRIGGER platform_admin_audit_pipeline_stage_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.audit_platform_admin_account_change();
