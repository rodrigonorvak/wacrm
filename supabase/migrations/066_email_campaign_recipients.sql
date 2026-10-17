ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS audience_tracking_started_at TIMESTAMPTZ;

UPDATE public.email_campaigns
SET audience_tracking_started_at = created_at
WHERE audience_tracking_started_at IS NULL;

ALTER TABLE public.email_campaigns
  ALTER COLUMN audience_tracking_started_at SET DEFAULT now(),
  ALTER COLUMN audience_tracking_started_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  campaign_id UUID NOT NULL
    REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL
    REFERENCES public.contacts(id) ON DELETE CASCADE,
  audience_source TEXT NOT NULL CHECK (
    audience_source IN ('selected_contact', 'pipeline_stage')
  ),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.email_campaign_recipient_counts (
  campaign_id UUID PRIMARY KEY
    REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_contact
  ON public.email_campaign_recipients(contact_id);

CREATE INDEX IF NOT EXISTS idx_email_campaign_pipeline_audience
  ON public.email_campaigns(account_id, audience_pipeline_id, audience_stage_id)
  WHERE audience_type = 'pipeline_stage'
    AND status IN ('draft', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_deals_account_pipeline_stage_contact
  ON public.deals(account_id, pipeline_id, stage_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_audience_backfill
  ON public.deal_stage_history(
    account_id,
    pipeline_id,
    to_stage_id,
    changed_at,
    deal_id
  );

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_campaign_recipients
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_campaign_recipients TO service_role;

ALTER TABLE public.email_campaign_recipient_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_campaign_recipient_counts
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_campaign_recipient_counts TO service_role;

CREATE OR REPLACE FUNCTION public.set_email_campaign_audience_tracking_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.audience_type IS DISTINCT FROM NEW.audience_type
    OR OLD.audience_contact_ids IS DISTINCT FROM NEW.audience_contact_ids
    OR OLD.audience_pipeline_id IS DISTINCT FROM NEW.audience_pipeline_id
    OR OLD.audience_stage_id IS DISTINCT FROM NEW.audience_stage_id
  THEN
    NEW.audience_tracking_started_at := clock_timestamp();
  ELSE
    NEW.audience_tracking_started_at := OLD.audience_tracking_started_at;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_email_campaign_audience_tracking_start()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_email_campaign_audience_tracking_start()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS email_campaigns_set_audience_tracking_start
  ON public.email_campaigns;
CREATE TRIGGER email_campaigns_set_audience_tracking_start
  BEFORE UPDATE OF
    audience_type,
    audience_contact_ids,
    audience_pipeline_id,
    audience_stage_id
  ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_email_campaign_audience_tracking_start();

CREATE OR REPLACE FUNCTION public.sync_email_campaign_audience_recipients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.audience_type IS NOT DISTINCT FROM NEW.audience_type
    AND OLD.audience_contact_ids IS NOT DISTINCT FROM NEW.audience_contact_ids
    AND OLD.audience_pipeline_id IS NOT DISTINCT FROM NEW.audience_pipeline_id
    AND OLD.audience_stage_id IS NOT DISTINCT FROM NEW.audience_stage_id
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('email-campaign-audience-v1'),
    hashtext(NEW.account_id::TEXT)
  );

  DELETE FROM public.email_campaign_recipients
  WHERE campaign_id = NEW.id;

  IF NEW.status NOT IN ('draft', 'scheduled') THEN
    RETURN NEW;
  END IF;

  IF NEW.audience_type = 'selected_contacts' THEN
    INSERT INTO public.email_campaign_recipients (
      campaign_id,
      contact_id,
      audience_source
    )
    SELECT
      NEW.id,
      selected.contact_id,
      'selected_contact'
    FROM unnest(NEW.audience_contact_ids) AS selected(contact_id)
    JOIN public.contacts AS contact
      ON contact.id = selected.contact_id
      AND contact.account_id = NEW.account_id
    ON CONFLICT (campaign_id, contact_id) DO NOTHING;
  ELSIF NEW.audience_type = 'pipeline_stage' THEN
    INSERT INTO public.email_campaign_recipients (
      campaign_id,
      contact_id,
      audience_source
    )
    SELECT
      NEW.id,
      deal.contact_id,
      'pipeline_stage'
    FROM public.deals AS deal
    JOIN public.contacts AS contact
      ON contact.id = deal.contact_id
      AND contact.account_id = NEW.account_id
    WHERE deal.account_id = NEW.account_id
      AND deal.pipeline_id = NEW.audience_pipeline_id
      AND deal.stage_id = NEW.audience_stage_id
    ON CONFLICT (campaign_id, contact_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_email_campaign_audience_recipients()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_email_campaign_audience_recipients()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS email_campaigns_sync_audience_after_insert
  ON public.email_campaigns;
CREATE TRIGGER email_campaigns_sync_audience_after_insert
  AFTER INSERT ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_campaign_audience_recipients();

DROP TRIGGER IF EXISTS email_campaigns_sync_audience_after_update
  ON public.email_campaigns;
CREATE TRIGGER email_campaigns_sync_audience_after_update
  AFTER UPDATE OF
    audience_type,
    audience_contact_ids,
    audience_pipeline_id,
    audience_stage_id
  ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_campaign_audience_recipients();

CREATE OR REPLACE FUNCTION public.add_deal_to_email_campaign_audiences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.account_id IS NOT DISTINCT FROM NEW.account_id
    AND OLD.pipeline_id IS NOT DISTINCT FROM NEW.pipeline_id
    AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id
    AND OLD.contact_id IS NOT DISTINCT FROM NEW.contact_id
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('email-campaign-audience-v1'),
    hashtext(NEW.account_id::TEXT)
  );

  INSERT INTO public.email_campaign_recipients (
    campaign_id,
    contact_id,
    audience_source
  )
  SELECT
    campaign.id,
    NEW.contact_id,
    'pipeline_stage'
  FROM public.email_campaigns AS campaign
  JOIN public.contacts AS contact
    ON contact.id = NEW.contact_id
    AND contact.account_id = NEW.account_id
  WHERE campaign.account_id = NEW.account_id
    AND campaign.audience_type = 'pipeline_stage'
    AND campaign.audience_pipeline_id = NEW.pipeline_id
    AND campaign.audience_stage_id = NEW.stage_id
    AND campaign.status IN ('draft', 'scheduled')
  ON CONFLICT (campaign_id, contact_id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.add_deal_to_email_campaign_audiences()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.add_deal_to_email_campaign_audiences()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS deals_add_email_campaign_audience_after_insert
  ON public.deals;
CREATE TRIGGER deals_add_email_campaign_audience_after_insert
  AFTER INSERT ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.add_deal_to_email_campaign_audiences();

DROP TRIGGER IF EXISTS deals_add_email_campaign_audience_after_update
  ON public.deals;
CREATE TRIGGER deals_add_email_campaign_audience_after_update
  AFTER UPDATE OF account_id, pipeline_id, stage_id, contact_id
  ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.add_deal_to_email_campaign_audiences();

CREATE OR REPLACE FUNCTION public.increment_email_campaign_recipient_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.email_campaign_recipient_counts AS counts (
    campaign_id,
    member_count
  )
  SELECT campaign_id, count(*)::INTEGER
  FROM inserted_recipients
  GROUP BY campaign_id
  ON CONFLICT (campaign_id) DO UPDATE
  SET member_count = counts.member_count + EXCLUDED.member_count;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.increment_email_campaign_recipient_counts()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.increment_email_campaign_recipient_counts()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decrement_email_campaign_recipient_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.email_campaign_recipient_counts AS counts
  SET member_count =
    GREATEST(counts.member_count - removed.recipient_count, 0)
  FROM (
    SELECT campaign_id, count(*)::INTEGER AS recipient_count
    FROM deleted_recipients
    GROUP BY campaign_id
  ) AS removed
  WHERE counts.campaign_id = removed.campaign_id;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.decrement_email_campaign_recipient_counts()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decrement_email_campaign_recipient_counts()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS email_campaign_recipients_increment_count
  ON public.email_campaign_recipients;
CREATE TRIGGER email_campaign_recipients_increment_count
  AFTER INSERT ON public.email_campaign_recipients
  REFERENCING NEW TABLE AS inserted_recipients
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.increment_email_campaign_recipient_counts();

DROP TRIGGER IF EXISTS email_campaign_recipients_decrement_count
  ON public.email_campaign_recipients;
CREATE TRIGGER email_campaign_recipients_decrement_count
  AFTER DELETE ON public.email_campaign_recipients
  REFERENCING OLD TABLE AS deleted_recipients
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.decrement_email_campaign_recipient_counts();

INSERT INTO public.email_campaign_recipients (
  campaign_id,
  contact_id,
  audience_source,
  added_at
)
SELECT
  campaign.id,
  selected.contact_id,
  'selected_contact',
  campaign.created_at
FROM public.email_campaigns AS campaign
CROSS JOIN LATERAL unnest(campaign.audience_contact_ids) AS selected(contact_id)
JOIN public.contacts AS contact
  ON contact.id = selected.contact_id
  AND contact.account_id = campaign.account_id
WHERE campaign.audience_type = 'selected_contacts'
  AND campaign.status IN ('draft', 'scheduled')
ON CONFLICT (campaign_id, contact_id) DO NOTHING;

INSERT INTO public.email_campaign_recipients (
  campaign_id,
  contact_id,
  audience_source,
  added_at
)
SELECT
  campaign.id,
  member.contact_id,
  'pipeline_stage',
  member.added_at
FROM public.email_campaigns AS campaign
JOIN (
  SELECT
    campaign.id AS campaign_id,
    deal.contact_id,
    history.changed_at AS added_at
  FROM public.email_campaigns AS campaign
  JOIN public.deal_stage_history AS history
    ON history.account_id = campaign.account_id
    AND history.pipeline_id = campaign.audience_pipeline_id
    AND history.to_stage_id = campaign.audience_stage_id
    AND history.changed_at >= campaign.audience_tracking_started_at
  JOIN public.deals AS deal
    ON deal.id = history.deal_id
    AND deal.account_id = campaign.account_id
  WHERE campaign.audience_type = 'pipeline_stage'
    AND campaign.status IN ('draft', 'scheduled')

  UNION ALL

  SELECT
    campaign.id AS campaign_id,
    deal.contact_id,
    campaign.created_at AS added_at
  FROM public.email_campaigns AS campaign
  JOIN public.deals AS deal
    ON deal.account_id = campaign.account_id
    AND deal.pipeline_id = campaign.audience_pipeline_id
    AND deal.stage_id = campaign.audience_stage_id
  WHERE campaign.audience_type = 'pipeline_stage'
    AND campaign.status IN ('draft', 'scheduled')
) AS member
  ON member.campaign_id = campaign.id
JOIN public.contacts AS contact
  ON contact.id = member.contact_id
  AND contact.account_id = campaign.account_id
WHERE campaign.audience_type = 'pipeline_stage'
  AND campaign.status IN ('draft', 'scheduled')
ON CONFLICT (campaign_id, contact_id) DO NOTHING;

INSERT INTO public.email_campaign_recipient_counts (
  campaign_id,
  member_count
)
SELECT campaign_id, count(*)::INTEGER
FROM public.email_campaign_recipients
GROUP BY campaign_id
ON CONFLICT (campaign_id) DO UPDATE
SET member_count = EXCLUDED.member_count;
