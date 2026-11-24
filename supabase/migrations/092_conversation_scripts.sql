-- Sales scripts shown in the inbox right panel. Platform admin edits HTML/CSS;
-- agents only read active scripts for their account.

CREATE TABLE IF NOT EXISTS public.conversation_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  html_content TEXT NOT NULL DEFAULT '',
  css_content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_scripts_account_position_idx
  ON public.conversation_scripts (account_id, position, title);

ALTER TABLE public.conversation_scripts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.conversation_scripts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.conversation_scripts TO authenticated;
GRANT ALL ON TABLE public.conversation_scripts TO service_role;

DROP POLICY IF EXISTS conversation_scripts_select ON public.conversation_scripts;
CREATE POLICY conversation_scripts_select ON public.conversation_scripts
  FOR SELECT USING (
    is_account_member(account_id)
    AND is_active = TRUE
  );

DROP TRIGGER IF EXISTS set_updated_at ON public.conversation_scripts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.conversation_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
