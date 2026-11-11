ALTER TABLE public.email_campaign_deliveries
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_campaign_deliveries_campaign_opened
  ON public.email_campaign_deliveries(campaign_id, opened_at DESC)
  WHERE status = 'sent' AND opened_at IS NOT NULL;
