CREATE TABLE public.ao_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid,
  lead_id uuid,
  from_agent text NOT NULL DEFAULT 'chief',
  to_agent text NOT NULL,
  directive text NOT NULL,
  rationale text,
  status text NOT NULL DEFAULT 'assigned',
  attempts int NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  escalation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ao_delegations TO authenticated;
GRANT ALL ON public.ao_delegations TO service_role;
ALTER TABLE public.ao_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view delegations" ON public.ao_delegations
FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));

CREATE TABLE public.ao_supervision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid,
  lead_id uuid,
  agent_key text NOT NULL DEFAULT 'concierge',
  kind text NOT NULL DEFAULT 'outbound_message',
  draft text NOT NULL,
  final_text text,
  verdict text NOT NULL DEFAULT 'approve',
  score numeric,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewer_model text,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ao_supervision TO authenticated;
GRANT ALL ON public.ao_supervision TO service_role;
ALTER TABLE public.ao_supervision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view supervision" ON public.ao_supervision
FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));

CREATE INDEX ao_delegations_status_idx ON public.ao_delegations (status, created_at DESC);
CREATE INDEX ao_supervision_created_idx ON public.ao_supervision (created_at DESC);

CREATE TRIGGER ao_delegations_updated_at BEFORE UPDATE ON public.ao_delegations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();