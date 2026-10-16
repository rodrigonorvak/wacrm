CREATE TABLE IF NOT EXISTS public.platform_feature_access (
  feature_key TEXT PRIMARY KEY CHECK (
    feature_key IN ('broadcasts', 'automations', 'flows', 'agents')
  ),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_feature_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_feature_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_feature_access TO service_role;

INSERT INTO public.platform_feature_access (feature_key, enabled)
VALUES
  ('broadcasts', FALSE),
  ('automations', FALSE),
  ('flows', FALSE),
  ('agents', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
