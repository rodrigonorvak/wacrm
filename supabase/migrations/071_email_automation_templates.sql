CREATE TABLE IF NOT EXISTS public.email_automation_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_connection_id UUID NOT NULL
    REFERENCES public.email_sender_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  preheader TEXT NOT NULL DEFAULT '' CHECK (length(preheader) <= 250),
  content_json JSONB NOT NULL CHECK (jsonb_typeof(content_json) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_automation_templates_account_updated
  ON public.email_automation_templates(account_id, updated_at DESC);

ALTER TABLE public.email_automation_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_automation_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_automation_templates TO service_role;
