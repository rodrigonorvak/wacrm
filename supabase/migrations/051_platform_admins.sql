-- Platform administrators are separate from account owners/admins.
-- There is intentionally no client insert policy: the first super_admin
-- must be provisioned manually by an operator, and later grants should be
-- implemented through an audited server-side workflow.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_admin_role') THEN
    CREATE TYPE platform_admin_role AS ENUM ('super_admin', 'support', 'billing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role platform_admin_role NOT NULL DEFAULT 'support',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_self_read ON public.platform_admins;
CREATE POLICY platform_admins_self_read
  ON public.platform_admins FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.platform_admins;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.platform_admins IS
  'Global CRM platform administrators; separate from per-account roles. Provision manually or through an audited server workflow.';
