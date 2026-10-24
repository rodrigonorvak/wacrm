ALTER TABLE public.lead_integrations
  DROP CONSTRAINT IF EXISTS lead_integrations_provider_check;

ALTER TABLE public.lead_integrations
  ADD CONSTRAINT lead_integrations_provider_check
  CHECK (provider IN ('elementor', 'universal'));

ALTER TABLE public.lead_integrations
  ADD COLUMN IF NOT EXISTS source_label TEXT;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE public.contacts
  ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN public.deals.source IS
  'Human-readable origin of a deal created by an inbound integration.';

COMMENT ON COLUMN public.lead_integrations.source_label IS
  'User-defined platform/source label for universal inbound webhooks.';
