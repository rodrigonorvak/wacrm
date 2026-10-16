CREATE TABLE IF NOT EXISTS public.deal_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#61bd4f',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_labels_account_idx ON public.deal_labels (account_id);

CREATE TABLE IF NOT EXISTS public.deal_label_links (
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.deal_labels(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, label_id)
);

CREATE INDEX IF NOT EXISTS deal_label_links_label_idx ON public.deal_label_links (label_id);
CREATE INDEX IF NOT EXISTS deal_label_links_account_idx ON public.deal_label_links (account_id);

ALTER TABLE public.deal_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_label_links ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_label_links TO authenticated;
GRANT ALL ON public.deal_labels TO service_role;
GRANT ALL ON public.deal_label_links TO service_role;

DROP POLICY IF EXISTS deal_labels_select ON public.deal_labels;
DROP POLICY IF EXISTS deal_labels_insert ON public.deal_labels;
DROP POLICY IF EXISTS deal_labels_update ON public.deal_labels;
DROP POLICY IF EXISTS deal_labels_delete ON public.deal_labels;
CREATE POLICY deal_labels_select ON public.deal_labels
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_labels_insert ON public.deal_labels
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_labels_update ON public.deal_labels
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_labels_delete ON public.deal_labels
  FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS deal_label_links_select ON public.deal_label_links;
DROP POLICY IF EXISTS deal_label_links_insert ON public.deal_label_links;
DROP POLICY IF EXISTS deal_label_links_delete ON public.deal_label_links;
CREATE POLICY deal_label_links_select ON public.deal_label_links
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_label_links_insert ON public.deal_label_links
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent')
    AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.account_id = deal_label_links.account_id)
    AND EXISTS (SELECT 1 FROM public.deal_labels l WHERE l.id = label_id AND l.account_id = deal_label_links.account_id)
  );
CREATE POLICY deal_label_links_delete ON public.deal_label_links
  FOR DELETE USING (is_account_member(account_id, 'agent'));
