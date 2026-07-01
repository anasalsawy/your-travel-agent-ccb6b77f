CREATE TABLE public.azure_agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('web','whatsapp','admin')),
  external_id text NOT NULL,
  assistant_id text NOT NULL,
  thread_id text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id, assistant_id)
);
GRANT ALL ON public.azure_agent_threads TO service_role;
ALTER TABLE public.azure_agent_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.azure_agent_threads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_azure_threads_lookup ON public.azure_agent_threads(channel, external_id, assistant_id);