ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'deal_reminder'));

CREATE INDEX IF NOT EXISTS notifications_deal_id_idx
  ON public.notifications (deal_id, created_at DESC)
  WHERE deal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.deal_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL CHECK (length(btrim(message)) > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deal_reminders_due_idx
  ON public.deal_reminders (remind_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS deal_reminders_deal_idx
  ON public.deal_reminders (deal_id, remind_at DESC);

ALTER TABLE public.deal_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_reminders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_reminders TO authenticated;
GRANT ALL ON TABLE public.deal_reminders TO service_role;
REVOKE UPDATE ON TABLE public.deal_reminders FROM authenticated;
GRANT UPDATE (status) ON TABLE public.deal_reminders TO authenticated;

DROP POLICY IF EXISTS deal_reminders_select ON public.deal_reminders;
CREATE POLICY deal_reminders_select ON public.deal_reminders FOR SELECT
  USING (
    is_account_member(account_id)
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_reminders.deal_id
        AND d.account_id = deal_reminders.account_id
        AND d.pipeline_id = deal_reminders.pipeline_id
    )
  );
DROP POLICY IF EXISTS deal_reminders_insert ON public.deal_reminders;
CREATE POLICY deal_reminders_insert ON public.deal_reminders FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('pending', 'cancelled')
    AND is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_reminders.deal_id
        AND d.account_id = deal_reminders.account_id
        AND d.pipeline_id = deal_reminders.pipeline_id
    )
  );
DROP POLICY IF EXISTS deal_reminders_update ON public.deal_reminders;
CREATE POLICY deal_reminders_update ON public.deal_reminders FOR UPDATE
  USING (created_by = auth.uid() AND is_account_member(account_id, 'agent'))
  WITH CHECK (
    created_by = auth.uid()
    AND is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_reminders.deal_id
        AND d.account_id = deal_reminders.account_id
        AND d.pipeline_id = deal_reminders.pipeline_id
    )
  );
DROP POLICY IF EXISTS deal_reminders_delete ON public.deal_reminders;
CREATE POLICY deal_reminders_delete ON public.deal_reminders FOR DELETE
  USING (created_by = auth.uid() AND is_account_member(account_id, 'agent'));

CREATE TABLE IF NOT EXISTS public.deal_service_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(btrim(label)) > 0),
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_service_steps_deal_position_idx
  ON public.deal_service_steps (deal_id, position, created_at);

ALTER TABLE public.deal_service_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_service_steps FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_service_steps TO authenticated;
GRANT ALL ON TABLE public.deal_service_steps TO service_role;
REVOKE UPDATE ON TABLE public.deal_service_steps FROM authenticated;
GRANT UPDATE (completed_at) ON TABLE public.deal_service_steps TO authenticated;

DROP POLICY IF EXISTS deal_service_steps_select ON public.deal_service_steps;
CREATE POLICY deal_service_steps_select ON public.deal_service_steps FOR SELECT
  USING (
    is_account_member(account_id)
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_service_steps.deal_id
        AND d.account_id = deal_service_steps.account_id
    )
  );
DROP POLICY IF EXISTS deal_service_steps_insert ON public.deal_service_steps;
CREATE POLICY deal_service_steps_insert ON public.deal_service_steps FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_service_steps.deal_id
        AND d.account_id = deal_service_steps.account_id
    )
  );
DROP POLICY IF EXISTS deal_service_steps_update ON public.deal_service_steps;
CREATE POLICY deal_service_steps_update ON public.deal_service_steps FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_service_steps.deal_id
        AND d.account_id = deal_service_steps.account_id
    )
  );
DROP POLICY IF EXISTS deal_service_steps_delete ON public.deal_service_steps;
CREATE POLICY deal_service_steps_delete ON public.deal_service_steps FOR DELETE
  USING (is_account_member(account_id, 'agent'));

CREATE OR REPLACE FUNCTION public.dispatch_due_deal_reminders(p_limit INTEGER DEFAULT 50)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reminder RECORD;
  contact_label TEXT;
  dispatched INTEGER := 0;
BEGIN
  FOR reminder IN
    SELECT r.id, r.account_id, r.pipeline_id, r.deal_id, r.created_by, r.message
    FROM public.deal_reminders r
    WHERE r.status = 'pending'
      AND r.remind_at <= clock_timestamp()
    ORDER BY r.remind_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT COALESCE(NULLIF(c.name, ''), c.phone, 'Lead')
    INTO contact_label
    FROM public.deals d
    LEFT JOIN public.contacts c ON c.id = d.contact_id
    WHERE d.id = reminder.deal_id;

    INSERT INTO public.notifications (
      account_id,
      user_id,
      type,
      deal_id,
      pipeline_id,
      actor_user_id,
      title,
      body
    ) VALUES (
      reminder.account_id,
      reminder.created_by,
      'deal_reminder',
      reminder.deal_id,
      reminder.pipeline_id,
      NULL,
      'Lembrete: ' || COALESCE(contact_label, 'Lead'),
      reminder.message
    );

    UPDATE public.deal_reminders
    SET status = 'sent', sent_at = clock_timestamp()
    WHERE id = reminder.id;
    dispatched := dispatched + 1;
  END LOOP;

  RETURN dispatched;
END;
$$;

ALTER FUNCTION public.dispatch_due_deal_reminders(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dispatch_due_deal_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_deal_reminders(INTEGER) TO service_role;