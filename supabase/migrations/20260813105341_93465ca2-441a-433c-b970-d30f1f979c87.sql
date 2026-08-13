
CREATE TABLE public.ao_dev_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  area text NOT NULL DEFAULT 'site',
  problem text NOT NULL DEFAULT '',
  proposal text NOT NULL DEFAULT '',
  expected_impact text,
  risk text NOT NULL DEFAULT 'low',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  patch_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  raised_by text NOT NULL DEFAULT 'dev-lead',
  status text NOT NULL DEFAULT 'proposed',
  verdict text,
  tally jsonb NOT NULL DEFAULT '{}'::jsonb,
  branch text,
  pr_number integer,
  pr_url text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ao_dev_proposals(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  vote text NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, agent_key)
);

CREATE TABLE public.ao_telegram_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  from_user text,
  command text NOT NULL,
  args text,
  handled boolean NOT NULL DEFAULT false,
  response text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ao_dev_proposals_status_idx ON public.ao_dev_proposals (status, created_at DESC);
CREATE INDEX ao_votes_proposal_idx ON public.ao_votes (proposal_id);

GRANT SELECT ON public.ao_dev_proposals TO authenticated;
GRANT SELECT ON public.ao_votes TO authenticated;
GRANT SELECT ON public.ao_telegram_commands TO authenticated;
GRANT ALL ON public.ao_dev_proposals TO service_role;
GRANT ALL ON public.ao_votes TO service_role;
GRANT ALL ON public.ao_telegram_commands TO service_role;

ALTER TABLE public.ao_dev_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_telegram_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read dev proposals" ON public.ao_dev_proposals
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff read votes" ON public.ao_votes
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff read telegram commands" ON public.ao_telegram_commands
  FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));

CREATE TRIGGER ao_dev_proposals_updated_at
  BEFORE UPDATE ON public.ao_dev_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ao_agents (agent_key, display_name, department, charter, autonomy_level, sort_order)
VALUES
  ('dev-lead', 'Head of Engineering', 'engineering',
   'Owns the website. Audits pages, APIs and conversion surfaces, raises change proposals to the council, and ships approved changes to the repository. Never ships an unapproved change.', 4, 40),
  ('dev-frontend', 'Frontend Engineer', 'engineering',
   'Implements approved UI, copy, layout and conversion changes on the marketing and booking surfaces.', 3, 41),
  ('dev-backend', 'Backend Engineer', 'engineering',
   'Implements approved backend function, integration and data changes. Verifies third-party APIs are alive and swaps failing providers for the fallback in the capability ladder.', 3, 42),
  ('dev-qa', 'QA Engineer', 'engineering',
   'Reviews every proposal for regression risk, votes against unsafe changes, and verifies shipped changes with evidence.', 3, 43),
  ('growth-engineer', 'Growth Engineer', 'engineering',
   'Finds revenue leaks in the funnel, proposes experiments on offers, pricing presentation and landing pages, and measures outcomes.', 3, 44)
ON CONFLICT (agent_key) DO NOTHING;
