-- Remember which attendant started the silence clock, so the automatic
-- move into "Parou de responder" is credited to that person.
-- Also record when the lead replies and when someone opens the inbox thread.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS silence_started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.deal_attention_dismissals
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'dismissed';

ALTER TABLE public.deal_attention_dismissals
  DROP CONSTRAINT IF EXISTS deal_attention_dismissals_kind_check;

ALTER TABLE public.deal_attention_dismissals
  ADD CONSTRAINT deal_attention_dismissals_kind_check
  CHECK (kind IN ('dismissed', 'lead_replied', 'inbox_opened'));

CREATE OR REPLACE FUNCTION public.acknowledge_inbox_open(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_contact_id UUID;
  v_deal RECORD;
  v_cleared INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, contact_id
  INTO v_account_id, v_contact_id
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_contact_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_deal IN
    SELECT id
    FROM public.deals
    WHERE account_id = v_account_id
      AND contact_id = v_contact_id
      AND needs_attention = TRUE
  LOOP
    UPDATE public.deals
    SET needs_attention = FALSE,
        attention_label = NULL
    WHERE id = v_deal.id
      AND needs_attention = TRUE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.deal_attention_dismissals (
      account_id, deal_id, dismissed_by, kind
    ) VALUES (
      v_account_id, v_deal.id, auth.uid(), 'inbox_opened'
    );

    UPDATE public.notifications
    SET read_at = now()
    WHERE account_id = v_account_id
      AND deal_id = v_deal.id
      AND type = 'lead_awaiting'
      AND read_at IS NULL;

    v_cleared := v_cleared + 1;
  END LOOP;

  RETURN v_cleared;
END;
$$;

ALTER FUNCTION public.acknowledge_inbox_open(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.acknowledge_inbox_open(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_inbox_open(UUID) TO authenticated, service_role;
