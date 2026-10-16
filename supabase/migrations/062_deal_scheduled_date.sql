ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS scheduled_date DATE;
