-- Meta Conversions API integrations are account-scoped and may receive
-- leads from either Elementor or Meta Instant Forms.

-- Keep the composite stage foreign keys below tied to the stage's pipeline.
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_id_pipeline_id_key
  ON pipeline_stages(id, pipeline_id);

CREATE TABLE IF NOT EXISTS meta_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id),
  source_type TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  api_version TEXT NOT NULL DEFAULT 'v25.0',
  schedule_stage_id UUID REFERENCES pipeline_stages(id),
  purchase_stage_id UUID REFERENCES pipeline_stages(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_tested_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_integrations_source_type_check
    CHECK (source_type IN ('elementor', 'meta_instant_form')),
  CONSTRAINT meta_integrations_unique_source
    UNIQUE (account_id, source_type),
  CONSTRAINT meta_integrations_schedule_stage_pipeline_fk
    FOREIGN KEY (schedule_stage_id, pipeline_id)
    REFERENCES pipeline_stages(id, pipeline_id),
  CONSTRAINT meta_integrations_purchase_stage_pipeline_fk
    FOREIGN KEY (purchase_stage_id, pipeline_id)
    REFERENCES pipeline_stages(id, pipeline_id)
);

CREATE INDEX IF NOT EXISTS meta_integrations_account_id_idx
  ON meta_integrations(account_id);

ALTER TABLE meta_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_integrations_select ON meta_integrations;
CREATE POLICY meta_integrations_select ON meta_integrations FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS meta_integrations_modify ON meta_integrations;
CREATE POLICY meta_integrations_modify ON meta_integrations FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS meta_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES meta_integrations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id),
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id),
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  meta_response JSONB,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_conversion_events_status_check
    CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT meta_conversion_events_unique_event
    UNIQUE (integration_id, event_id)
);

CREATE INDEX IF NOT EXISTS meta_conversion_events_account_id_idx
  ON meta_conversion_events(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meta_conversion_events_deal_id_idx
  ON meta_conversion_events(deal_id);

ALTER TABLE meta_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_conversion_events_select ON meta_conversion_events;
CREATE POLICY meta_conversion_events_select ON meta_conversion_events FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS meta_conversion_events_modify ON meta_conversion_events;
CREATE POLICY meta_conversion_events_modify ON meta_conversion_events FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));