-- Per-account module access, managed only by platform administrators
-- through the service role. A missing row means the module is locked.
CREATE TABLE IF NOT EXISTS public.account_feature_access (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (
    feature_key IN ('broadcasts', 'automations', 'flows', 'agents')
  ),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, feature_key)
);

ALTER TABLE public.account_feature_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_feature_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.account_feature_access TO service_role;
