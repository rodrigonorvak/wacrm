-- record_webhook_failure is SECURITY DEFINER and accepts an endpoint UUID.
-- Its only caller is the trusted webhook delivery worker using service_role.
-- PostgreSQL grants EXECUTE to PUBLIC by default, so explicitly revoke it.

REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role;
