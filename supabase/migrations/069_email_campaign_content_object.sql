-- Campaign content is now stored as { version, blocks, design }.
-- Legacy rows stay valid as a plain array of blocks.
ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_content_json_check;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_content_json_shape;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_content_json_shape CHECK (
    jsonb_typeof(content_json) = 'array'
    OR (
      jsonb_typeof(content_json) = 'object'
      AND jsonb_typeof(content_json -> 'blocks') = 'array'
    )
  );
