-- The stopped-reply badge used to say "Aguardando resposta".
-- New replies use "Respondeu!". Existing automation configs are renamed
-- here; deal rows keep their timestamp so a label change does not
-- reshuffle the board.

UPDATE public.automations
SET
  trigger_config = jsonb_set(trigger_config, '{attention_label}', '"Respondeu!"'),
  updated_at = NOW()
WHERE trigger_type = 'lead_silence'
  AND trigger_config->>'attention_label' = 'Aguardando resposta';
