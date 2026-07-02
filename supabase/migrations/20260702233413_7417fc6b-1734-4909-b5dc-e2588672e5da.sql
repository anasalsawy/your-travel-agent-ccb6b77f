
CREATE TABLE IF NOT EXISTS public.foundry_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  channel text,
  external_id text,
  conversation_id text,
  response_id text,
  request_message text,
  final_text text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'started',
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer
);

GRANT SELECT ON public.foundry_runs TO authenticated;
GRANT ALL ON public.foundry_runs TO service_role;

ALTER TABLE public.foundry_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read foundry_runs" ON public.foundry_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS foundry_runs_started_idx ON public.foundry_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS foundry_runs_agent_idx ON public.foundry_runs (agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS foundry_runs_source_idx ON public.foundry_runs (source, started_at DESC);
