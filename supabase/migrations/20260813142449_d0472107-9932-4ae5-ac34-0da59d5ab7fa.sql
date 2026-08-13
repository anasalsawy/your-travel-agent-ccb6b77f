CREATE OR REPLACE FUNCTION public.ai_traffic_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  gone_leases int;
  gone_tickets int;
BEGIN
  PERFORM pg_advisory_xact_lock(918273645);
  WITH d AS (DELETE FROM public.ai_concurrency_leases WHERE expires_at < now() RETURNING 1)
  SELECT count(*) INTO gone_leases FROM d;
  WITH d AS (DELETE FROM public.ai_traffic_queue WHERE expires_at < now() RETURNING 1)
  SELECT count(*) INTO gone_tickets FROM d;
  RETURN jsonb_build_object('leases_swept', gone_leases, 'tickets_swept', gone_tickets);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_traffic_sweep() TO service_role;