CREATE TABLE IF NOT EXISTS public.ao_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  agent_key text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error text,
  depth int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ao_agent_runs_due ON public.ao_agent_runs (status, next_run_at);
CREATE INDEX IF NOT EXISTS ao_agent_runs_room ON public.ao_agent_runs (room_id);

GRANT ALL ON public.ao_agent_runs TO service_role;
ALTER TABLE public.ao_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ao_claim_agent_runs(p_limit int DEFAULT 3, p_lease_seconds int DEFAULT 120)
RETURNS SETOF public.ao_agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ao_agent_runs r
  SET status = 'running',
      lease_until = now() + make_interval(secs => p_lease_seconds),
      attempts = r.attempts + 1,
      updated_at = now()
  WHERE r.id IN (
    SELECT id FROM public.ao_agent_runs
    WHERE (status = 'pending' AND next_run_at <= now())
       OR (status = 'running' AND lease_until < now())
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING r.*;
$$;