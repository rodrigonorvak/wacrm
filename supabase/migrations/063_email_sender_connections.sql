CREATE TABLE IF NOT EXISTS public.email_sender_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  provider TEXT NOT NULL CHECK (provider IN ('gmail_smtp', 'custom_smtp')),
  from_email TEXT NOT NULL CHECK (length(from_email) <= 254),
  from_name TEXT NOT NULL DEFAULT '' CHECK (length(from_name) <= 120),
  smtp_host TEXT NOT NULL CHECK (length(smtp_host) BETWEEN 1 AND 253),
  smtp_port INTEGER NOT NULL CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_username TEXT NOT NULL CHECK (length(smtp_username) BETWEEN 1 AND 254),
  smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
  encrypted_password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sender_connections_account
  ON public.email_sender_connections(account_id, created_at DESC);

ALTER TABLE public.email_sender_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_sender_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_sender_connections TO service_role;
