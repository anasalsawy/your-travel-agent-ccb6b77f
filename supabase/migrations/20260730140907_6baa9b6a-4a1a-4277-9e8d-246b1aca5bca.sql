
CREATE TABLE public.ao_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  department text NOT NULL,
  charter text NOT NULL,
  strategist_prompt text NOT NULL DEFAULT '',
  executor_prompt text NOT NULL DEFAULT '',
  tools text[] NOT NULL DEFAULT '{}',
  addons jsonb NOT NULL DEFAULT '{}'::jsonb,
  autonomy_level int NOT NULL DEFAULT 3,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  status text NOT NULL DEFAULT 'active',
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'lead',
  priority int NOT NULL DEFAULT 5,
  source text,
  customer_name text,
  customer_email text,
  customer_phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_value numeric DEFAULT 0,
  realized_value numeric DEFAULT 0,
  owner_agent text,
  status text NOT NULL DEFAULT 'open',
  outcome text,
  needs_human boolean NOT NULL DEFAULT false,
  escalation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.ao_missions(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  title text NOT NULL,
  instruction text NOT NULL,
  state text NOT NULL DEFAULT 'todo',
  attempt int NOT NULL DEFAULT 0,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_dialogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid REFERENCES public.ao_missions(id) ON DELETE CASCADE,
  task_id uuid,
  from_agent text NOT NULL,
  to_agent text,
  lobe text,
  kind text NOT NULL DEFAULT 'say',
  content text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid,
  agent_key text,
  event_type text NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ao_tasks_mission_idx ON public.ao_tasks(mission_id);
CREATE INDEX ao_dialogue_mission_idx ON public.ao_dialogue(mission_id, created_at DESC);
CREATE INDEX ao_missions_stage_idx ON public.ao_missions(status, stage);
CREATE INDEX ao_events_created_idx ON public.ao_events(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_missions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_dialogue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_events TO authenticated;
GRANT ALL ON public.ao_agents TO service_role;
GRANT ALL ON public.ao_missions TO service_role;
GRANT ALL ON public.ao_tasks TO service_role;
GRANT ALL ON public.ao_dialogue TO service_role;
GRANT ALL ON public.ao_policies TO service_role;
GRANT ALL ON public.ao_events TO service_role;

ALTER TABLE public.ao_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_dialogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage ao_agents" ON public.ao_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_missions" ON public.ao_missions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_tasks" ON public.ao_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_dialogue" ON public.ao_dialogue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_policies" ON public.ao_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_events" ON public.ao_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ao_agents_updated BEFORE UPDATE ON public.ao_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_missions_updated BEFORE UPDATE ON public.ao_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_tasks_updated BEFORE UPDATE ON public.ao_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
