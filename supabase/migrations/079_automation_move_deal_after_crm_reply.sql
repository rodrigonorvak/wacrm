ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS first_response_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.automation_deal_reply_moves (
  deal_id UUID PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  source_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id),
  destination_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (source_stage_id <> destination_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_deal_reply_moves_pending
  ON public.automation_deal_reply_moves(account_id, conversation_id, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.automation_deal_reply_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_deal_reply_moves FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.automation_deal_reply_moves TO service_role;

DROP FUNCTION IF EXISTS public.automation_send_to_pipeline(UUID, UUID, UUID, UUID, UUID, UUID);

CREATE FUNCTION public.automation_send_to_pipeline(
  p_automation_id UUID,
  p_account_id UUID,
  p_contact_id UUID,
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_title TEXT;
  v_currency TEXT;
  v_deal_id UUID;
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
    RETURN NULL;
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
  )
  RETURNING id INTO v_deal_id;
  RETURN v_deal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_send_to_pipeline(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_send_to_pipeline(UUID, UUID, UUID, UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_register_deal_reply_move(
  p_automation_id UUID,
  p_account_id UUID,
  p_deal_id UUID,
  p_pipeline_id UUID,
  p_destination_stage_id UUID,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_stage_id UUID;
  v_contact_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.automations
    WHERE id = p_automation_id AND account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Automation does not belong to account';
  END IF;

  SELECT stage_id, contact_id INTO v_source_stage_id, v_contact_id
  FROM public.deals
  WHERE id = p_deal_id AND account_id = p_account_id AND pipeline_id = p_pipeline_id
  FOR UPDATE;
  IF NOT FOUND OR v_contact_id IS NULL THEN
    RAISE EXCEPTION 'New lead does not belong to account and pipeline';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages
    WHERE id = p_destination_stage_id AND pipeline_id = p_pipeline_id
  ) OR p_destination_stage_id = v_source_stage_id THEN
    RAISE EXCEPTION 'Destination stage is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND account_id = p_account_id AND contact_id = v_contact_id
  ) THEN
    RAISE EXCEPTION 'Conversation does not belong to lead and account';
  END IF;

  INSERT INTO public.automation_deal_reply_moves (
    deal_id, automation_id, account_id, conversation_id, pipeline_id,
    source_stage_id, destination_stage_id
  ) VALUES (
    p_deal_id, p_automation_id, p_account_id, p_conversation_id, p_pipeline_id,
    v_source_stage_id, p_destination_stage_id
  )
  ON CONFLICT (deal_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_register_deal_reply_move(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_register_deal_reply_move(UUID, UUID, UUID, UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.automation_move_deal_on_crm_reply(
  p_account_id UUID,
  p_conversation_id UUID,
  p_actor_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_move public.automation_deal_reply_moves%ROWTYPE;
  v_moved_count INTEGER := 0;
  v_did_move BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_actor_user_id
      AND account_id = p_account_id
      AND account_role IN ('owner', 'admin', 'agent')
  ) THEN
    RAISE EXCEPTION 'CRM responder is not an agent in this account';
  END IF;

  FOR v_move IN
    SELECT * FROM public.automation_deal_reply_moves
    WHERE account_id = p_account_id
      AND conversation_id = p_conversation_id
      AND processed_at IS NULL
    ORDER BY created_at
    FOR UPDATE
  LOOP
    UPDATE public.deals
    SET stage_id = v_move.destination_stage_id,
        first_response_by = p_actor_user_id,
        first_response_at = NOW(),
        updated_at = NOW()
    WHERE id = v_move.deal_id
      AND account_id = p_account_id
      AND status = 'open'
      AND stage_id = v_move.source_stage_id;

    v_did_move := FOUND;
    IF v_did_move THEN
      v_moved_count := v_moved_count + 1;
      UPDATE public.deal_stage_history
      SET changed_by = p_actor_user_id
      WHERE id = (
        SELECT id FROM public.deal_stage_history
        WHERE deal_id = v_move.deal_id
          AND to_stage_id = v_move.destination_stage_id
          AND changed_by IS NULL
        ORDER BY changed_at DESC, id DESC
        LIMIT 1
      );
    END IF;

    UPDATE public.automation_deal_reply_moves
    SET processed_at = NOW(),
        moved_by = CASE WHEN v_did_move THEN p_actor_user_id ELSE NULL END
    WHERE deal_id = v_move.deal_id;
  END LOOP;

  RETURN v_moved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_move_deal_on_crm_reply(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.automation_move_deal_on_crm_reply(UUID, UUID, UUID) TO service_role;
