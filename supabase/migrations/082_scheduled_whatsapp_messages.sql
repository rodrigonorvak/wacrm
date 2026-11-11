CREATE TABLE public.scheduled_whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  scheduled_at TIMESTAMPTZ NOT NULL CHECK (extract(second FROM scheduled_at) = 0),
  variables JSONB NOT NULL CHECK (jsonb_typeof(variables) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'uncertain', 'cancelled')),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  whatsapp_message_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX scheduled_whatsapp_messages_active_slot
  ON public.scheduled_whatsapp_messages (account_id, contact_id, scheduled_at)
  WHERE status IN ('pending', 'processing', 'uncertain');

CREATE INDEX scheduled_whatsapp_messages_due
  ON public.scheduled_whatsapp_messages (scheduled_at, id)
  WHERE status = 'pending';

CREATE INDEX scheduled_whatsapp_messages_contact
  ON public.scheduled_whatsapp_messages (account_id, contact_id, scheduled_at);

ALTER TABLE public.scheduled_whatsapp_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_whatsapp_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scheduled_whatsapp_messages TO authenticated;
GRANT ALL ON public.scheduled_whatsapp_messages TO service_role;

CREATE POLICY scheduled_whatsapp_messages_select
  ON public.scheduled_whatsapp_messages FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE FUNCTION public.claim_scheduled_whatsapp_message()
RETURNS SETOF public.scheduled_whatsapp_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.scheduled_whatsapp_messages
  SET status = 'processing', claimed_at = clock_timestamp()
  WHERE id = (
    SELECT id
    FROM public.scheduled_whatsapp_messages
    WHERE status = 'pending' AND scheduled_at <= clock_timestamp()
    ORDER BY scheduled_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduled_whatsapp_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_whatsapp_message() TO service_role;