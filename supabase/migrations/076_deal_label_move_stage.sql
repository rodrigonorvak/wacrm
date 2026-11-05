ALTER TABLE public.deal_labels
  ADD COLUMN IF NOT EXISTS webhook_move_stage_id UUID
  REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
