CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_connection_id UUID NOT NULL
    REFERENCES public.email_sender_connections(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  subject TEXT NOT NULL DEFAULT '' CHECK (length(subject) <= 255),
  preheader TEXT NOT NULL DEFAULT '' CHECK (length(preheader) <= 250),
  audience_type TEXT NOT NULL CHECK (
    audience_type IN ('all_contacts', 'selected_contacts', 'pipeline_stage')
  ),
  audience_contact_ids UUID[] NOT NULL DEFAULT '{}',
  audience_pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  audience_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  content_json JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(content_json) = 'array'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'archived')
  ),
  scheduled_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  opened_count INTEGER NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
  clicked_count INTEGER NOT NULL DEFAULT 0 CHECK (clicked_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_campaigns_audience_shape CHECK (
    (audience_type = 'all_contacts'
      AND cardinality(audience_contact_ids) = 0
      AND audience_pipeline_id IS NULL
      AND audience_stage_id IS NULL)
    OR
    (audience_type = 'selected_contacts'
      AND cardinality(audience_contact_ids) > 0
      AND audience_pipeline_id IS NULL
      AND audience_stage_id IS NULL)
    OR
    (audience_type = 'pipeline_stage'
      AND cardinality(audience_contact_ids) = 0
      AND audience_pipeline_id IS NOT NULL
      AND audience_stage_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_account_updated
  ON public.email_campaigns(account_id, updated_at DESC);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_campaigns FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;
