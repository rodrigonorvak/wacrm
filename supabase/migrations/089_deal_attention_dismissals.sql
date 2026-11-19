-- Who turned off the orange "Respondeu!" pulse, shown in the lead history.

CREATE TABLE IF NOT EXISTS public.deal_attention_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_attention_dismissals_deal_idx
  ON public.deal_attention_dismissals (deal_id, dismissed_at, id);

ALTER TABLE public.deal_attention_dismissals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.deal_attention_dismissals FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.deal_attention_dismissals TO authenticated;
GRANT ALL ON TABLE public.deal_attention_dismissals TO service_role;

DROP POLICY IF EXISTS deal_attention_dismissals_select ON public.deal_attention_dismissals;
CREATE POLICY deal_attention_dismissals_select ON public.deal_attention_dismissals
  FOR SELECT USING (is_account_member(account_id));

CREATE OR REPLACE FUNCTION public.dismiss_deal_attention(p_deal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_cleared INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'deal not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_account_member(v_account_id, 'agent') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.deals
  SET needs_attention = FALSE,
      attention_label = NULL
  WHERE id = p_deal_id
    AND account_id = v_account_id
    AND needs_attention = TRUE;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  IF v_cleared = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.deal_attention_dismissals (account_id, deal_id, dismissed_by)
  VALUES (v_account_id, p_deal_id, auth.uid());

  UPDATE public.notifications
  SET read_at = now()
  WHERE account_id = v_account_id
    AND deal_id = p_deal_id
    AND type = 'lead_awaiting'
    AND read_at IS NULL;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.dismiss_deal_attention(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dismiss_deal_attention(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_deal_attention(UUID) TO authenticated, service_role;
