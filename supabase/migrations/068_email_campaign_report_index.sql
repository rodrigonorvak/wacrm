CREATE INDEX IF NOT EXISTS idx_email_campaign_deliveries_campaign_created
  ON public.email_campaign_deliveries(campaign_id, created_at DESC, id DESC);
