-- Follow Up column type, paid-leads-only toggle on lead columns,
-- and due-date notifications that rise when the scheduled day arrives.

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS paid_leads_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_stage_type_check;

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT pipeline_stages_stage_type_check
  CHECK (stage_type IN ('other', 'lead', 'schedule', 'purchase', 'follow_up'));

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'deal_reminder',
    'lead_awaiting',
    'platform_message',
    'follow_up_due'
  ));

CREATE OR REPLACE FUNCTION public.dispatch_follow_up_due_notifications(
  p_account_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deal_row RECORD;
  recipient RECORD;
  contact_label TEXT;
  dispatched INTEGER := 0;
  today_local DATE := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  FOR deal_row IN
    SELECT
      d.id AS deal_id,
      d.account_id,
      d.pipeline_id,
      d.title,
      d.assigned_to,
      d.scheduled_date
    FROM public.deals d
    INNER JOIN public.pipeline_stages s ON s.id = d.stage_id
    WHERE s.stage_type = 'follow_up'
      AND d.scheduled_date IS NOT NULL
      AND d.scheduled_date = today_local
      AND d.status = 'open'
      AND (p_account_id IS NULL OR d.account_id = p_account_id)
    ORDER BY d.scheduled_date, d.updated_at DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 300))
  LOOP
    contact_label := COALESCE(NULLIF(deal_row.title, ''), 'Lead');

    FOR recipient IN
      SELECT p.user_id
      FROM public.profiles p
      WHERE p.account_id = deal_row.account_id
        AND p.account_role IN ('owner', 'admin', 'agent')
        AND (
          deal_row.assigned_to IS NULL
          OR p.user_id = deal_row.assigned_to
          OR p.account_role IN ('owner', 'admin')
        )
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = recipient.user_id
          AND n.deal_id = deal_row.deal_id
          AND n.type = 'follow_up_due'
          AND (timezone('America/Sao_Paulo', n.created_at))::date = today_local
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.notifications (
        account_id,
        user_id,
        type,
        deal_id,
        pipeline_id,
        title,
        body
      ) VALUES (
        deal_row.account_id,
        recipient.user_id,
        'follow_up_due',
        deal_row.deal_id,
        deal_row.pipeline_id,
        'Follow up hoje',
        contact_label
      );
      dispatched := dispatched + 1;
    END LOOP;
  END LOOP;

  RETURN dispatched;
END;
$$;

ALTER FUNCTION public.dispatch_follow_up_due_notifications(UUID, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dispatch_follow_up_due_notifications(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_follow_up_due_notifications(UUID, INTEGER)
  TO authenticated, service_role;
