ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS stage_type TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_stages_stage_type_check'
      AND conrelid = 'public.pipeline_stages'::regclass
  ) THEN
    ALTER TABLE public.pipeline_stages
      ADD CONSTRAINT pipeline_stages_stage_type_check
      CHECK (stage_type IN ('other', 'lead', 'schedule', 'purchase'));
  END IF;
END $$;

WITH stage_type_candidates AS (
  SELECT schedule_stage_id AS stage_id, 'schedule'::TEXT AS stage_type
  FROM public.meta_integrations
  WHERE schedule_stage_id IS NOT NULL
  UNION ALL
  SELECT purchase_stage_id AS stage_id, 'purchase'::TEXT AS stage_type
  FROM public.meta_integrations
  WHERE purchase_stage_id IS NOT NULL
),
unambiguous_stage_types AS (
  SELECT stage_id, MIN(stage_type) AS stage_type
  FROM stage_type_candidates
  GROUP BY stage_id
  HAVING COUNT(DISTINCT stage_type) = 1
)
UPDATE public.pipeline_stages AS stage
SET stage_type = unambiguous_stage_types.stage_type
FROM unambiguous_stage_types
WHERE stage.id = unambiguous_stage_types.stage_id;

UPDATE public.pipeline_stages AS stage
SET stage_type = CASE
  WHEN stage.position = 0 AND stage.name = 'Novo Lead' THEN 'lead'
  WHEN stage.position = 2 AND stage.name = 'Reunião' THEN 'schedule'
  WHEN stage.position = 4 AND stage.name = 'Contrato pago' THEN 'purchase'
END
FROM public.pipelines AS pipeline
WHERE pipeline.id = stage.pipeline_id
  AND pipeline.pipeline_type = 'integrated'
  AND (
    (stage.position = 0 AND stage.name = 'Novo Lead')
    OR (stage.position = 2 AND stage.name = 'Reunião')
    OR (stage.position = 4 AND stage.name = 'Contrato pago')
  )
  AND stage.stage_type = 'other'
  AND NOT EXISTS (
    SELECT 1
    FROM public.meta_integrations AS integration
    WHERE integration.schedule_stage_id = stage.id
       OR integration.purchase_stage_id = stage.id
  );

ALTER TABLE public.meta_integrations
  ALTER COLUMN schedule_stage_id DROP NOT NULL,
  ALTER COLUMN purchase_stage_id DROP NOT NULL;

UPDATE public.meta_integrations
SET schedule_stage_id = NULL,
    purchase_stage_id = NULL
WHERE schedule_stage_id IS NOT NULL
   OR purchase_stage_id IS NOT NULL;
