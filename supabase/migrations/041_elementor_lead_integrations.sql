-- ============================================================
-- Elementor lead integrations.
--
-- This migration only adds storage for the future inbound lead
-- webhook. Existing pipelines and contacts keep their current model.
-- Secrets are stored as hashes; the plaintext token will be shown
-- only when the application creates or regenerates an endpoint.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'elementor',
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lead_integrations_provider_check CHECK (provider = 'elementor'),
  CONSTRAINT lead_integrations_pipeline_unique UNIQUE (pipeline_id),
  CONSTRAINT lead_integrations_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS lead_integrations_account_id_idx
  ON lead_integrations (account_id);

ALTER TABLE lead_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_integrations_select ON lead_integrations;
CREATE POLICY lead_integrations_select ON lead_integrations FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS lead_integrations_insert ON lead_integrations;
CREATE POLICY lead_integrations_insert ON lead_integrations FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_integrations_update ON lead_integrations;
CREATE POLICY lead_integrations_update ON lead_integrations FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_integrations_delete ON lead_integrations;
CREATE POLICY lead_integrations_delete ON lead_integrations FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS lead_integration_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES lead_integrations(id) ON DELETE CASCADE,
  source_field_id TEXT NOT NULL,
  source_label TEXT,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lead_integration_mappings_target_type_check
    CHECK (target_type IN ('contact', 'contact_custom_field', 'deal', 'source_metadata')),
  CONSTRAINT lead_integration_mappings_unique_source
    UNIQUE (integration_id, source_field_id)
);

CREATE INDEX IF NOT EXISTS lead_integration_mappings_integration_id_idx
  ON lead_integration_mappings (integration_id);

ALTER TABLE lead_integration_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_integration_mappings_select ON lead_integration_mappings;
CREATE POLICY lead_integration_mappings_select ON lead_integration_mappings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_mappings.integration_id
      AND is_account_member(lead_integrations.account_id)
  ));

DROP POLICY IF EXISTS lead_integration_mappings_modify ON lead_integration_mappings;
CREATE POLICY lead_integration_mappings_modify ON lead_integration_mappings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_mappings.integration_id
      AND is_account_member(lead_integrations.account_id, 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_mappings.integration_id
      AND is_account_member(lead_integrations.account_id, 'admin')
  ));

CREATE TABLE IF NOT EXISTS lead_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES lead_integrations(id) ON DELETE CASCADE,
  external_event_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT lead_integration_events_status_check
    CHECK (status IN ('received', 'processed', 'failed')),
  CONSTRAINT lead_integration_events_unique_external_id
    UNIQUE (integration_id, external_event_id)
);

CREATE INDEX IF NOT EXISTS lead_integration_events_integration_id_idx
  ON lead_integration_events (integration_id, received_at DESC);

ALTER TABLE lead_integration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_integration_events_select ON lead_integration_events;
CREATE POLICY lead_integration_events_select ON lead_integration_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_events.integration_id
      AND is_account_member(lead_integrations.account_id)
  ));

-- Event writes will be performed by the server-side webhook handler.
DROP POLICY IF EXISTS lead_integration_events_modify ON lead_integration_events;
CREATE POLICY lead_integration_events_modify ON lead_integration_events FOR ALL
  USING (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_events.integration_id
      AND is_account_member(lead_integrations.account_id, 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lead_integrations
    WHERE lead_integrations.id = lead_integration_events.integration_id
      AND is_account_member(lead_integrations.account_id, 'admin')
  ));