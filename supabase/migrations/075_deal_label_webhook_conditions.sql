ALTER TABLE public.deal_labels
  ADD COLUMN IF NOT EXISTS webhook_condition_path TEXT,
  ADD COLUMN IF NOT EXISTS webhook_condition_value TEXT;

DROP INDEX IF EXISTS public.deal_labels_account_webhook_event_idx;

CREATE UNIQUE INDEX IF NOT EXISTS deal_labels_account_webhook_rule_idx
  ON public.deal_labels (
    account_id,
    webhook_event,
    COALESCE(webhook_condition_path, ''),
    COALESCE(webhook_condition_value, '')
  )
  WHERE webhook_event IS NOT NULL;
