CREATE TABLE IF NOT EXISTS public.deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  from_stage_name TEXT,
  to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_name TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_stage_history_deal_changed_at_idx
  ON public.deal_stage_history (deal_id, changed_at DESC, id DESC);

ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.deal_stage_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.deal_stage_history TO authenticated;
GRANT ALL ON TABLE public.deal_stage_history TO service_role;

DROP POLICY IF EXISTS deal_stage_history_select ON public.deal_stage_history;
CREATE POLICY deal_stage_history_select ON public.deal_stage_history
  FOR SELECT USING (is_account_member(account_id));

CREATE OR REPLACE FUNCTION public.record_deal_stage_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_stage_name TEXT;
  next_stage_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
      RETURN NEW;
    END IF;

    SELECT name INTO previous_stage_name
    FROM public.pipeline_stages
    WHERE id = OLD.stage_id;
  END IF;

  SELECT name INTO next_stage_name
  FROM public.pipeline_stages
  WHERE id = NEW.stage_id;

  INSERT INTO public.deal_stage_history (
    account_id,
    pipeline_id,
    deal_id,
    from_stage_id,
    from_stage_name,
    to_stage_id,
    to_stage_name,
    changed_by,
    changed_at
  ) VALUES (
    NEW.account_id,
    NEW.pipeline_id,
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage_id END,
    previous_stage_name,
    NEW.stage_id,
    next_stage_name,
    auth.uid(),
    clock_timestamp()
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.record_deal_stage_history() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_deal_stage_history() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS deals_record_initial_stage_history ON public.deals;
CREATE TRIGGER deals_record_initial_stage_history
  AFTER INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.record_deal_stage_history();

DROP TRIGGER IF EXISTS deals_record_stage_change_history ON public.deals;
CREATE TRIGGER deals_record_stage_change_history
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.record_deal_stage_history();