-- A forced-password-change member may only use the dedicated password
-- change endpoint. All tenant RLS policies call is_account_member, so gate
-- the shared predicate using server-managed app_metadata from the JWT.

CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'must_change_password', 'false') <> 'true'
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id = target_account_id
        AND CASE p.account_role
              WHEN 'owner'  THEN 4
              WHEN 'admin'  THEN 3
              WHEN 'agent'  THEN 2
              WHEN 'viewer' THEN 1
            END
          >=
            CASE min_role
              WHEN 'owner'  THEN 4
              WHEN 'admin'  THEN 3
              WHEN 'agent'  THEN 2
              WHEN 'viewer' THEN 1
            END
    );
$$;

ALTER FUNCTION public.is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, account_role_enum) TO authenticated, service_role;
