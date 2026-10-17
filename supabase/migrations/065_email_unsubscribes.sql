CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  address_hash TEXT NOT NULL CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  source_campaign_id UUID,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, address_hash)
);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_campaign
  ON public.email_unsubscribes(source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_unsubscribes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_unsubscribes TO service_role;
