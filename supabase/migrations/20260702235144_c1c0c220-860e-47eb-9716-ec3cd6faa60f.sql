CREATE TABLE public.foundry_connection_backups (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  label text not null,
  scope text not null,
  agent_name text,
  payload jsonb not null
);
GRANT SELECT, INSERT ON public.foundry_connection_backups TO authenticated;
GRANT ALL ON public.foundry_connection_backups TO service_role;
ALTER TABLE public.foundry_connection_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read backups" ON public.foundry_connection_backups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.foundry_connection_probes (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  phase text not null,
  agent_name text not null,
  connection_name text,
  connection_type text,
  auth_type text,
  identity_used text,
  test_result text,
  error jsonb,
  raw jsonb
);
GRANT SELECT, INSERT ON public.foundry_connection_probes TO authenticated;
GRANT ALL ON public.foundry_connection_probes TO service_role;
ALTER TABLE public.foundry_connection_probes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read probes" ON public.foundry_connection_probes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));