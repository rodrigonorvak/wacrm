CREATE TABLE IF NOT EXISTS public.email_campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL
    REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email_address TEXT NOT NULL CHECK (
    length(email_address) BETWEEN 3 AND 254
    AND email_address = lower(btrim(email_address))
    AND email_address ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sending', 'sent', 'failed', 'skipped')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_deliveries_queue
  ON public.email_campaign_deliveries(status, created_at, id)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_email_campaign_deliveries_campaign_status
  ON public.email_campaign_deliveries(campaign_id, status);

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS delivery_lease_until TIMESTAMPTZ;

ALTER TABLE public.email_campaign_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_campaign_deliveries
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_campaign_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_email_campaign_delivery(
  p_campaign_id UUID,
  p_account_id UUID,
  p_scheduled_at TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  campaign_row public.email_campaigns%ROWTYPE;
  queued_count INTEGER;
BEGIN
  SELECT *
  INTO campaign_row
  FROM public.email_campaigns
  WHERE id = p_campaign_id
    AND account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF campaign_row.status <> 'draft' THEN
    RAISE EXCEPTION 'campaign_not_draft' USING ERRCODE = 'P0001';
  END IF;
  IF p_scheduled_at IS NULL
    OR p_scheduled_at < clock_timestamp() - INTERVAL '30 seconds'
    OR p_scheduled_at > clock_timestamp() + INTERVAL '1 year'
  THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('email-campaign-audience-v1'),
    hashtext(p_account_id::TEXT)
  );

  DELETE FROM public.email_campaign_deliveries
  WHERE campaign_id = p_campaign_id;

  WITH eligible_contacts AS (
    SELECT
      contact.id AS contact_id,
      lower(btrim(contact.email)) AS email_address
    FROM public.contacts AS contact
    WHERE contact.account_id = p_account_id
      AND contact.email IS NOT NULL
      AND length(btrim(contact.email)) BETWEEN 3 AND 254
      AND btrim(contact.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      AND (
        campaign_row.audience_type = 'all_contacts'
        OR EXISTS (
          SELECT 1
          FROM public.email_campaign_recipients AS recipient
          WHERE recipient.campaign_id = p_campaign_id
            AND recipient.contact_id = contact.id
        )
      )
  ),
  unique_addresses AS (
    SELECT DISTINCT ON (email_address)
      contact_id,
      email_address
    FROM eligible_contacts
    ORDER BY email_address, contact_id
  )
  INSERT INTO public.email_campaign_deliveries (
    account_id,
    campaign_id,
    contact_id,
    email_address
  )
  SELECT
    p_account_id,
    p_campaign_id,
    unique_addresses.contact_id,
    unique_addresses.email_address
  FROM unique_addresses
  ON CONFLICT (campaign_id, email_address) DO NOTHING;

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  IF queued_count = 0 THEN
    RAISE EXCEPTION 'campaign_empty_audience' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.email_campaigns
  SET
    status = 'scheduled',
    scheduled_at = p_scheduled_at,
    sent_count = 0,
    updated_at = now()
  WHERE id = p_campaign_id;

  RETURN queued_count;
END;
$$;

ALTER FUNCTION public.prepare_email_campaign_delivery(UUID, UUID, TIMESTAMPTZ)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_email_campaign_delivery(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_email_campaign_delivery(UUID, UUID, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_email_campaign_delivery_batch(
  p_batch_size INTEGER
)
RETURNS TABLE (
  delivery_id UUID,
  campaign_id UUID,
  account_id UUID,
  email_address TEXT,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 20 THEN
    RAISE EXCEPTION 'invalid_batch_size' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH available_campaigns AS (
    SELECT campaign.id
    FROM public.email_campaigns AS campaign
    WHERE campaign.status IN ('scheduled', 'sending')
      AND campaign.scheduled_at <= now()
      AND (
        campaign.status = 'scheduled'
        OR campaign.delivery_lease_until IS NULL
        OR campaign.delivery_lease_until <= now()
      )
    ORDER BY campaign.scheduled_at, campaign.id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  eligible_deliveries AS (
    SELECT delivery.id
    FROM public.email_campaign_deliveries AS delivery
    JOIN available_campaigns AS campaign
      ON campaign.id = delivery.campaign_id
    WHERE delivery.status = 'queued'
    ORDER BY delivery.created_at, delivery.id
    LIMIT p_batch_size
    FOR UPDATE OF delivery SKIP LOCKED
  ),
  claimed_deliveries AS (
    UPDATE public.email_campaign_deliveries AS delivery
    SET
      status = 'sending',
      attempt_count = delivery.attempt_count + 1,
      locked_at = clock_timestamp()
    FROM eligible_deliveries AS eligible
    WHERE delivery.id = eligible.id
    RETURNING
      delivery.id,
      delivery.campaign_id,
      delivery.account_id,
      delivery.email_address,
      delivery.attempt_count
  ),
  started_campaigns AS (
    UPDATE public.email_campaigns AS campaign
    SET
      status = 'sending',
      delivery_lease_until = clock_timestamp() + INTERVAL '3 minutes',
      updated_at = now()
    WHERE campaign.id IN (
      SELECT claimed.campaign_id FROM claimed_deliveries AS claimed
    )
      AND campaign.status IN ('scheduled', 'sending')
    RETURNING campaign.id
  )
  SELECT
    claimed.id,
    claimed.campaign_id,
    claimed.account_id,
    claimed.email_address,
    claimed.attempt_count
  FROM claimed_deliveries AS claimed
  LEFT JOIN started_campaigns AS started
    ON started.id = claimed.campaign_id;
END;
$$;

ALTER FUNCTION public.claim_email_campaign_delivery_batch(INTEGER)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_email_campaign_delivery_batch(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_campaign_delivery_batch(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_campaign_delivery(
  p_delivery_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_campaign_id UUID;
  sent_total INTEGER;
  has_unfinished BOOLEAN;
  has_failures BOOLEAN;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid_delivery_status' USING ERRCODE = '22023';
  END IF;

  SELECT campaign_id
  INTO target_campaign_id
  FROM public.email_campaign_deliveries
  WHERE id = p_delivery_id;

  IF target_campaign_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM 1
  FROM public.email_campaigns
  WHERE id = target_campaign_id
  FOR UPDATE;

  UPDATE public.email_campaign_deliveries
  SET
    status = p_status,
    sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE NULL END,
    locked_at = NULL,
    last_error = CASE
      WHEN p_status = 'failed' THEN left(coalesce(p_error, 'SMTP send failed'), 500)
      WHEN p_status = 'skipped' THEN left(coalesce(p_error, 'Recipient suppressed'), 500)
      ELSE NULL
    END
  WHERE id = p_delivery_id
    AND campaign_id = target_campaign_id
    AND status = 'sending';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'sent')::INTEGER,
    coalesce(bool_or(status IN ('queued', 'sending')), FALSE),
    coalesce(bool_or(status = 'failed'), FALSE)
  INTO sent_total, has_unfinished, has_failures
  FROM public.email_campaign_deliveries
  WHERE campaign_id = target_campaign_id;

  UPDATE public.email_campaigns
  SET
    sent_count = sent_total,
    delivery_lease_until = NULL,
    status = CASE
      WHEN has_unfinished THEN 'sending'
      WHEN has_failures THEN 'failed'
      ELSE 'sent'
    END,
    updated_at = now()
  WHERE id = target_campaign_id
    AND status IN ('scheduled', 'sending');

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.record_email_campaign_delivery(UUID, TEXT, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_email_campaign_delivery(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_campaign_delivery(UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_email_campaign_deliveries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recovered_count INTEGER;
BEGIN
  UPDATE public.email_campaign_deliveries
  SET
    status = 'failed',
    locked_at = NULL,
    last_error = 'The SMTP result could not be confirmed after the worker timed out. The message was not retried to avoid duplicates.'
  WHERE status = 'sending'
    AND locked_at < now() - INTERVAL '15 minutes';

  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$;

ALTER FUNCTION public.recover_stale_email_campaign_deliveries()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.recover_stale_email_campaign_deliveries()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_email_campaign_deliveries()
  TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_email_campaign_deliveries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_campaign_id UUID;
  sent_total INTEGER;
  has_failures BOOLEAN;
  finalized_count INTEGER := 0;
BEGIN
  FOR target_campaign_id IN
    SELECT campaign.id
    FROM public.email_campaigns AS campaign
    WHERE campaign.status IN ('scheduled', 'sending')
      AND campaign.scheduled_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_campaign_deliveries AS delivery
        WHERE delivery.campaign_id = campaign.id
          AND delivery.status IN ('queued', 'sending')
      )
    ORDER BY campaign.id
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT
      count(*) FILTER (WHERE status = 'sent')::INTEGER,
      coalesce(bool_or(status = 'failed'), FALSE)
    INTO sent_total, has_failures
    FROM public.email_campaign_deliveries
    WHERE campaign_id = target_campaign_id;

    UPDATE public.email_campaigns
    SET
      sent_count = sent_total,
      delivery_lease_until = NULL,
      status = CASE WHEN has_failures THEN 'failed' ELSE 'sent' END,
      updated_at = now()
    WHERE id = target_campaign_id
      AND status IN ('scheduled', 'sending');

    IF FOUND THEN
      finalized_count := finalized_count + 1;
    END IF;
  END LOOP;

  RETURN finalized_count;
END;
$$;

ALTER FUNCTION public.finalize_email_campaign_deliveries()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_email_campaign_deliveries()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_email_campaign_deliveries()
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_email_campaign_delivery_lease(
  p_campaign_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  released_count INTEGER;
BEGIN
  UPDATE public.email_campaigns
  SET delivery_lease_until = NULL
  WHERE id = ANY(coalesce(p_campaign_ids, ARRAY[]::UUID[]))
    AND status = 'sending';

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

ALTER FUNCTION public.release_email_campaign_delivery_lease(UUID[])
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_email_campaign_delivery_lease(UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_email_campaign_delivery_lease(UUID[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_email_campaign_delivery(
  p_campaign_id UUID,
  p_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  campaign_status TEXT;
BEGIN
  SELECT status
  INTO campaign_status
  FROM public.email_campaigns
  WHERE id = p_campaign_id
    AND account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND OR campaign_status <> 'scheduled' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.email_campaigns
  SET
    status = 'draft',
    scheduled_at = NULL,
    delivery_lease_until = NULL,
    sent_count = 0,
    updated_at = now()
  WHERE id = p_campaign_id;

  DELETE FROM public.email_campaign_deliveries
  WHERE campaign_id = p_campaign_id
    AND status = 'queued';

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.cancel_email_campaign_delivery(UUID, UUID)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_email_campaign_delivery(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_email_campaign_delivery(UUID, UUID)
  TO service_role;
