CREATE TABLE public.ai_concurrency_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  units int NOT NULL DEFAULT 1,
  holder text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 seconds'
);

GRANT ALL ON public.ai_concurrency_leases TO service_role;
ALTER TABLE public.ai_concurrency_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view leases" ON public.ai_concurrency_leases
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_leases_expires_idx ON public.ai_concurrency_leases (expires_at);

CREATE OR REPLACE FUNCTION public.acquire_ai_slot(p_model text, p_units int, p_budget int, p_holder text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used int;
  new_id uuid;
BEGIN
  DELETE FROM public.ai_concurrency_leases WHERE expires_at < now();
  SELECT COALESCE(sum(units), 0) INTO used FROM public.ai_concurrency_leases;
  IF used + p_units > p_budget THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.ai_concurrency_leases (model_id, units, holder, expires_at)
  VALUES (p_model, p_units, p_holder, now() + interval '90 seconds')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acquire_ai_slot(text, int, int, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_ai_slot(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.ai_concurrency_leases WHERE id = p_id;
$$;

REVOKE EXECUTE ON FUNCTION public.release_ai_slot(uuid) FROM anon, authenticated;