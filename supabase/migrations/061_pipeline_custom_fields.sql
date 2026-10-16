CREATE TABLE IF NOT EXISTS public.pipeline_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  show_on_card BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, pipeline_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_custom_fields_name_unique
  ON public.pipeline_custom_fields (pipeline_id, lower(field_name));

CREATE TABLE IF NOT EXISTS public.deal_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.pipeline_custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, field_id)
);

CREATE INDEX IF NOT EXISTS deal_custom_field_values_deal_idx
  ON public.deal_custom_field_values (deal_id);

ALTER TABLE public.pipeline_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_custom_fields_select ON public.pipeline_custom_fields;
CREATE POLICY pipeline_custom_fields_select ON public.pipeline_custom_fields
  FOR SELECT USING (public.is_account_member(account_id));
DROP POLICY IF EXISTS pipeline_custom_fields_insert ON public.pipeline_custom_fields;
CREATE POLICY pipeline_custom_fields_insert ON public.pipeline_custom_fields
  FOR INSERT WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_custom_fields.pipeline_id
        AND p.account_id = pipeline_custom_fields.account_id
    )
  );
DROP POLICY IF EXISTS pipeline_custom_fields_update ON public.pipeline_custom_fields;
CREATE POLICY pipeline_custom_fields_update ON public.pipeline_custom_fields
  FOR UPDATE USING (public.is_account_member(account_id, 'agent'))
  WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_custom_fields.pipeline_id
        AND p.account_id = pipeline_custom_fields.account_id
    )
  );
DROP POLICY IF EXISTS pipeline_custom_fields_delete ON public.pipeline_custom_fields;
CREATE POLICY pipeline_custom_fields_delete ON public.pipeline_custom_fields
  FOR DELETE USING (public.is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS deal_custom_field_values_select ON public.deal_custom_field_values;
CREATE POLICY deal_custom_field_values_select ON public.deal_custom_field_values
  FOR SELECT USING (public.is_account_member(account_id));
DROP POLICY IF EXISTS deal_custom_field_values_insert ON public.deal_custom_field_values;
CREATE POLICY deal_custom_field_values_insert ON public.deal_custom_field_values
  FOR INSERT WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_custom_field_values.deal_id
        AND d.account_id = deal_custom_field_values.account_id
        AND d.pipeline_id = deal_custom_field_values.pipeline_id
    )
    AND EXISTS (
      SELECT 1 FROM public.pipeline_custom_fields f
      WHERE f.id = deal_custom_field_values.field_id
        AND f.account_id = deal_custom_field_values.account_id
        AND f.pipeline_id = deal_custom_field_values.pipeline_id
    )
  );
DROP POLICY IF EXISTS deal_custom_field_values_update ON public.deal_custom_field_values;
CREATE POLICY deal_custom_field_values_update ON public.deal_custom_field_values
  FOR UPDATE USING (public.is_account_member(account_id, 'agent'))
  WITH CHECK (
    public.is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_custom_field_values.deal_id
        AND d.account_id = deal_custom_field_values.account_id
        AND d.pipeline_id = deal_custom_field_values.pipeline_id
    )
    AND EXISTS (
      SELECT 1 FROM public.pipeline_custom_fields f
      WHERE f.id = deal_custom_field_values.field_id
        AND f.account_id = deal_custom_field_values.account_id
        AND f.pipeline_id = deal_custom_field_values.pipeline_id
    )
  );
DROP POLICY IF EXISTS deal_custom_field_values_delete ON public.deal_custom_field_values;
CREATE POLICY deal_custom_field_values_delete ON public.deal_custom_field_values
  FOR DELETE USING (public.is_account_member(account_id, 'agent'));

REVOKE ALL ON public.pipeline_custom_fields FROM PUBLIC, anon;
REVOKE ALL ON public.deal_custom_field_values FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_custom_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_custom_field_values TO authenticated;
