-- Credentials needed to receive Meta Instant Form leadgen webhooks.
ALTER TABLE meta_integrations
  ADD COLUMN IF NOT EXISTS meta_page_id TEXT,
  ADD COLUMN IF NOT EXISTS page_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_received_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS meta_integrations_instant_page_key
  ON meta_integrations(source_type, meta_page_id)
  WHERE source_type = 'meta_instant_form' AND meta_page_id IS NOT NULL;