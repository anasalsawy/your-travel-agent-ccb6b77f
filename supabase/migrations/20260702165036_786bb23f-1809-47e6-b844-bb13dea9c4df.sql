
CREATE TABLE IF NOT EXISTS public.vapi_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id text UNIQUE,
  agent_name text NOT NULL,
  room_id uuid REFERENCES public.agent_rooms(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  goal text,
  status text NOT NULL DEFAULT 'queued',
  summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vapi_calls TO authenticated;
GRANT ALL ON public.vapi_calls TO service_role;
ALTER TABLE public.vapi_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage vapi_calls" ON public.vapi_calls FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.vapi_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.vapi_calls(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  meta jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vapi_call_events TO authenticated;
GRANT ALL ON public.vapi_call_events TO service_role;
ALTER TABLE public.vapi_call_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vapi_call_events" ON public.vapi_call_events FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write vapi_call_events" ON public.vapi_call_events FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_vapi_call_events_call ON public.vapi_call_events(call_id, at);
CREATE INDEX IF NOT EXISTS idx_vapi_calls_status ON public.vapi_calls(status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.vapi_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vapi_call_events;

CREATE TRIGGER trg_vapi_calls_updated
  BEFORE UPDATE ON public.vapi_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
