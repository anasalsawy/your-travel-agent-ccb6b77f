
ALTER TABLE public.ai_router_settings
  ADD COLUMN IF NOT EXISTS unit_budget integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS max_switches_per_min integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS allow_lovable_fallback boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_concurrency_leases
  ADD COLUMN IF NOT EXISTS lane text,
  ADD COLUMN IF NOT EXISTS ticket bigserial;

CREATE INDEX IF NOT EXISTS ai_leases_expires_idx ON public.ai_concurrency_leases (expires_at);

-- Fair waiting line: agents take a ticket, and only the oldest waiting tickets
-- may claim capacity, so no lane starves behind a noisy one.
CREATE TABLE IF NOT EXISTS public.ai_traffic_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder text NOT NULL,
  lane text,
  units integer NOT NULL DEFAULT 1,
  model_id text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 seconds'
);
GRANT ALL ON public.ai_traffic_queue TO service_role;
ALTER TABLE public.ai_traffic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai traffic queue" ON public.ai_traffic_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.ai_traffic_queue TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_traffic_enqueue(p_holder text, p_lane text, p_units integer, p_model text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE new_id uuid;
BEGIN
  DELETE FROM public.ai_traffic_queue WHERE expires_at < now();
  INSERT INTO public.ai_traffic_queue (holder, lane, units, model_id)
  VALUES (p_holder, p_lane, GREATEST(p_units, 1), p_model)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_traffic_dequeue(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ DELETE FROM public.ai_traffic_queue WHERE id = p_id; $$;

-- Atomic claim: serialized by an advisory lock so two isolates can never both
-- believe there is room. Only serves the caller if it is at the head of the line.
CREATE OR REPLACE FUNCTION public.ai_traffic_claim(
  p_ticket uuid, p_model text, p_units integer, p_budget integer, p_holder text, p_ttl_seconds integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  used int;
  head boolean;
  new_id uuid;
  u int := GREATEST(COALESCE(p_units, 1), 1);
BEGIN
  PERFORM pg_advisory_xact_lock(918273645);
  DELETE FROM public.ai_concurrency_leases WHERE expires_at < now();
  DELETE FROM public.ai_traffic_queue WHERE expires_at < now();

  SELECT (q.id = p_ticket) INTO head
  FROM public.ai_traffic_queue q
  ORDER BY q.enqueued_at ASC, q.id ASC
  LIMIT 1;

  IF head IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(units), 0) INTO used FROM public.ai_concurrency_leases;
  IF used + u > GREATEST(COALESCE(p_budget, 6), 1) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_concurrency_leases (model_id, units, holder, expires_at)
  VALUES (p_model, u, p_holder, now() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 120), 10)))
  RETURNING id INTO new_id;

  DELETE FROM public.ai_traffic_queue WHERE id = p_ticket;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_ai_slot(p_id uuid, p_ttl_seconds integer DEFAULT 120)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ai_concurrency_leases
  SET expires_at = now() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 120), 10))
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.ai_traffic_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'in_flight', (SELECT COALESCE(sum(units),0) FROM public.ai_concurrency_leases WHERE expires_at > now()),
    'leases', (SELECT COALESCE(jsonb_agg(jsonb_build_object('model', model_id, 'units', units, 'holder', holder, 'expires_at', expires_at)), '[]'::jsonb)
               FROM public.ai_concurrency_leases WHERE expires_at > now()),
    'waiting', (SELECT count(*) FROM public.ai_traffic_queue WHERE expires_at > now()),
    'queue', (SELECT COALESCE(jsonb_agg(jsonb_build_object('holder', holder, 'lane', lane, 'units', units, 'enqueued_at', enqueued_at) ORDER BY enqueued_at), '[]'::jsonb)
              FROM public.ai_traffic_queue WHERE expires_at > now())
  );
$$;
