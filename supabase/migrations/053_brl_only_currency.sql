-- This CRM tracks pipeline values in Brazilian reais only.
UPDATE public.accounts
SET default_currency = 'BRL'
WHERE default_currency IS DISTINCT FROM 'BRL';

ALTER TABLE public.accounts
  ALTER COLUMN default_currency SET DEFAULT 'BRL';

UPDATE public.deals
SET currency = 'BRL'
WHERE currency IS DISTINCT FROM 'BRL';

ALTER TABLE public.deals
  ALTER COLUMN currency SET DEFAULT 'BRL';

CREATE OR REPLACE FUNCTION public.force_brl_account_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.default_currency := 'BRL';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_force_brl_currency ON public.accounts;
CREATE TRIGGER accounts_force_brl_currency
  BEFORE INSERT OR UPDATE OF default_currency ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.force_brl_account_currency();

CREATE OR REPLACE FUNCTION public.force_brl_deal_currency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.currency := 'BRL';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_force_brl_currency ON public.deals;
CREATE TRIGGER deals_force_brl_currency
  BEFORE INSERT OR UPDATE OF currency ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.force_brl_deal_currency();