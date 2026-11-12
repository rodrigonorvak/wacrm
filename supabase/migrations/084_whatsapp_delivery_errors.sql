ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;
