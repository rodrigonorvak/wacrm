ALTER TABLE public.deal_labels
  ADD COLUMN IF NOT EXISTS webhook_event TEXT;

ALTER TABLE public.deal_labels
  DROP CONSTRAINT IF EXISTS deal_labels_webhook_event_length;
ALTER TABLE public.deal_labels
  ADD CONSTRAINT deal_labels_webhook_event_length
  CHECK (webhook_event IS NULL OR char_length(webhook_event) BETWEEN 1 AND 120);

CREATE UNIQUE INDEX IF NOT EXISTS deal_labels_account_webhook_event_idx
  ON public.deal_labels (account_id, webhook_event)
  WHERE webhook_event IS NOT NULL;

COMMENT ON COLUMN public.deal_labels.webhook_event IS
  'Inbound webhook event name (e.g. myeduzz.invoice_paid) that applies this label to the deal.';
