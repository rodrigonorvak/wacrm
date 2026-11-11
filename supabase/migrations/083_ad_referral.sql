ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS has_ad_referral BOOLEAN NOT NULL DEFAULT false;
