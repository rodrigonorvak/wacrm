-- Leads that go quiet after the team replies, and the orange
-- "Aguardando resposta" attention state when they write again.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS silence_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attention_label TEXT;

CREATE INDEX IF NOT EXISTS idx_deals_silence_due
  ON public.deals (account_id, stage_id, silence_started_at)
  WHERE silence_started_at IS NOT NULL;

-- One built-in "parou de responder" automation per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_automations_one_lead_silence
  ON public.automations (account_id)
  WHERE trigger_type = 'lead_silence';

INSERT INTO public.automations (
  user_id, account_id, name, description, trigger_type, trigger_config, is_active
)
SELECT
  a.owner_user_id,
  a.id,
  'Parou de responder',
  'Depois que o atendimento responde, se o lead ficar o tempo configurado sem responder, o card vai para a coluna escolhida. Se o lead responder depois, o card acende em laranja com a etiqueta temporária até o atendimento responder.',
  'lead_silence',
  jsonb_build_object(
    'builtin', true,
    'silence_minutes', 120,
    'attention_label', 'Aguardando resposta',
    'pipeline_id', '',
    'source_stage_id', '',
    'destination_stage_id', ''
  ),
  false
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.automations au
  WHERE au.account_id = a.id AND au.trigger_type = 'lead_silence'
);
