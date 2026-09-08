-- Link a processed integration event to the CRM records it created.
-- Existing events remain valid and can be backfilled later if needed.

ALTER TABLE lead_integration_events
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lead_integration_events_deal_id_idx
  ON lead_integration_events (deal_id);

CREATE INDEX IF NOT EXISTS lead_integration_events_contact_id_idx
  ON lead_integration_events (contact_id);