-- Keep account lifecycle state after an administrative deletion so a
-- returning OAuth user receives a useful status instead of looping.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_status_check
  CHECK (access_status IN ('pending', 'approved', 'denied', 'suspended', 'deleted'));

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_accounts_active_created
  ON public.accounts(created_at DESC)
  WHERE deleted_at IS NULL;
