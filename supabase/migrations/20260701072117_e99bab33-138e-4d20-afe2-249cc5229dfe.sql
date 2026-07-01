CREATE TABLE public.azure_assistants (
  role text PRIMARY KEY,
  assistant_id text NOT NULL,
  model text NOT NULL,
  name text,
  instructions text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.azure_assistants TO service_role;
ALTER TABLE public.azure_assistants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.azure_assistants FOR ALL TO service_role USING (true) WITH CHECK (true);