
CREATE TABLE public.ao_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'facebook',
  raw_text text not null,
  headline text not null,
  summary text,
  priority integer not null default 5,
  contact jsonb not null default '{}'::jsonb,
  itinerary jsonb not null default '{}'::jsonb,
  estimated_value numeric,
  channel text not null default 'facebook',
  external_thread_id text,
  status text not null default 'new',
  stage text not null default 'new',
  attempts integer not null default 0,
  cadence_step integer not null default 0,
  last_contact_at timestamptz,
  next_action_at timestamptz not null default now(),
  last_reply_at timestamptz,
  mission_id uuid references public.ao_missions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_leads TO authenticated;
GRANT ALL ON public.ao_leads TO service_role;
ALTER TABLE public.ao_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage leads" ON public.ao_leads FOR ALL TO authenticated
  USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE TABLE public.ao_outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.ao_leads(id) on delete cascade,
  mission_id uuid references public.ao_missions(id) on delete set null,
  direction text not null default 'out',
  channel text not null default 'facebook',
  agent_key text,
  body text not null,
  intent text,
  status text not null default 'queued',
  error text,
  evidence jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_outreach TO authenticated;
GRANT ALL ON public.ao_outreach TO service_role;
ALTER TABLE public.ao_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage outreach" ON public.ao_outreach FOR ALL TO authenticated
  USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE TABLE public.ao_channel_sessions (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  label text not null default 'primary',
  provider text not null default 'browserbase',
  context_id text,
  session_id text,
  status text not null default 'disconnected',
  live_view_url text,
  last_verified_at timestamptz,
  last_error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_channel_sessions TO authenticated;
GRANT ALL ON public.ao_channel_sessions TO service_role;
ALTER TABLE public.ao_channel_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage channel sessions" ON public.ao_channel_sessions FOR ALL TO authenticated
  USING (public.is_staff_or_admin(auth.uid())) WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE TABLE public.ao_runner_beats (
  id uuid primary key default gen_random_uuid(),
  beat_at timestamptz not null default now(),
  jobs jsonb not null default '{}'::jsonb,
  leads_touched integer not null default 0,
  missions_touched integer not null default 0,
  memory_ops integer not null default 0,
  duration_ms integer,
  ok boolean not null default true,
  notes text
);
GRANT SELECT ON public.ao_runner_beats TO authenticated;
GRANT ALL ON public.ao_runner_beats TO service_role;
ALTER TABLE public.ao_runner_beats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read beats" ON public.ao_runner_beats FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

CREATE INDEX ao_leads_next_action_idx ON public.ao_leads (next_action_at) WHERE status NOT IN ('won','lost','archived');
CREATE INDEX ao_outreach_lead_idx ON public.ao_outreach (lead_id, created_at DESC);
CREATE INDEX ao_runner_beats_at_idx ON public.ao_runner_beats (beat_at DESC);

CREATE TRIGGER ao_leads_updated BEFORE UPDATE ON public.ao_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_channel_sessions_updated BEFORE UPDATE ON public.ao_channel_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
