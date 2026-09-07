-- ============================================================
-- Pipeline types:
--   * standard   — existing/manual CRM pipeline behavior
--   * integrated — reserved for pipelines backed by an external source
--
-- Existing pipelines remain standard through the default and backfill.
-- ============================================================

ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS pipeline_type TEXT NOT NULL DEFAULT 'standard';

UPDATE pipelines
SET pipeline_type = 'standard'
WHERE pipeline_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipelines_pipeline_type_check'
      AND conrelid = 'pipelines'::regclass
  ) THEN
    ALTER TABLE pipelines
      ADD CONSTRAINT pipelines_pipeline_type_check
      CHECK (pipeline_type IN ('standard', 'integrated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pipelines_pipeline_type
  ON pipelines(pipeline_type);