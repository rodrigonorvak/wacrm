CREATE INDEX IF NOT EXISTS idx_deals_account_pipeline_contact
  ON public.deals (account_id, pipeline_id, contact_id);

CREATE OR REPLACE FUNCTION public.automation_send_to_pipeline(
  p_automation_id UUID,
  p_account_id UUID,
  p_contact_id UUID,
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_title TEXT;
  v_currency TEXT;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.automations
  WHERE id = p_automation_id AND account_id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Automation does not belong to account';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(name), ''), phone)
  INTO v_title
  FROM public.contacts
  WHERE id = p_contact_id AND account_id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact does not belong to account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE s.id = p_stage_id AND p.id = p_pipeline_id AND p.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Pipeline or stage does not belong to account';
  END IF;

  IF p_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND account_id = p_account_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'Conversation does not belong to contact and account';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_account_id::text || ':' || p_pipeline_id::text || ':' || p_contact_id::text, 0
  ));

  IF EXISTS (
    SELECT 1 FROM public.deals
    WHERE account_id = p_account_id AND pipeline_id = p_pipeline_id AND contact_id = p_contact_id
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT default_currency INTO v_currency FROM public.accounts WHERE id = p_account_id;
  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'Account currency is unavailable';
  END IF;

  INSERT INTO public.deals (
    account_id, user_id, pipeline_id, stage_id, contact_id,
    conversation_id, title, value, currency, status
  ) VALUES (
    p_account_id, v_user_id, p_pipeline_id, p_stage_id, p_contact_id,
    p_conversation_id, v_title, 0, v_currency, 'open'
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_send_to_pipeline(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_send_to_pipeline(UUID, UUID, UUID, UUID, UUID, UUID) TO service_role;
