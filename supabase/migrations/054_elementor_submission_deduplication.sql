CREATE TABLE IF NOT EXISTS public.lead_integration_deduplication (
  integration_id UUID NOT NULL REFERENCES public.lead_integrations(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS lead_integration_deduplication_received_idx
  ON public.lead_integration_deduplication (integration_id, last_received_at);

ALTER TABLE public.lead_integration_deduplication ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_elementor_lead_submission(
  p_integration_id UUID,
  p_dedupe_key TEXT,
  p_window_seconds INTEGER DEFAULT 120
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed BOOLEAN;
  safe_window_seconds INTEGER := GREATEST(1, LEAST(COALESCE(p_window_seconds, 120), 600));
BEGIN
  IF p_dedupe_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Elementor deduplication key';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_integration_id::TEXT || ':' || p_dedupe_key, 0)
  );

  DELETE FROM public.lead_integration_deduplication
  WHERE integration_id = p_integration_id
    AND last_received_at < clock_timestamp() - INTERVAL '30 days';

  INSERT INTO public.lead_integration_deduplication (
    integration_id,
    dedupe_key,
    last_received_at
  ) VALUES (
    p_integration_id,
    p_dedupe_key,
    clock_timestamp()
  )
  ON CONFLICT (integration_id, dedupe_key) DO UPDATE
    SET last_received_at = EXCLUDED.last_received_at
    WHERE public.lead_integration_deduplication.last_received_at
      <= clock_timestamp() - make_interval(secs => safe_window_seconds)
  RETURNING TRUE INTO claimed;

  RETURN COALESCE(claimed, FALSE);
END;
$$;

ALTER FUNCTION public.claim_elementor_lead_submission(UUID, TEXT, INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_elementor_lead_submission(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_elementor_lead_submission(UUID, TEXT, INTEGER) TO service_role;