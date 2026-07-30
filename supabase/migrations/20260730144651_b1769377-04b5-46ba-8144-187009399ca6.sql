
CREATE TABLE IF NOT EXISTS public.ai_model_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'featherless',
  model_id text not null,
  display_name text,
  model_class text,
  context_length integer,
  max_completion_tokens integer,
  is_gated boolean not null default false,
  available boolean not null default true,
  capabilities jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, model_id)
);

CREATE TABLE IF NOT EXISTS public.ai_model_health (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_id text not null,
  ok_count integer not null default 0,
  err_count integer not null default 0,
  consecutive_errors integer not null default 0,
  avg_latency_ms integer not null default 0,
  last_error text,
  last_status integer,
  last_used_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, model_id)
);

CREATE TABLE IF NOT EXISTS public.ai_router_settings (
  id text primary key default 'default',
  auto_select boolean not null default true,
  primary_provider text not null default 'featherless',
  default_model text,
  fallback_models text[] not null default '{}',
  emergency_model text not null default 'google/gemini-2.5-flash',
  cooldown_seconds integer not null default 600,
  max_attempts integer not null default 4,
  updated_at timestamptz not null default now()
);

INSERT INTO public.ai_router_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.ai_model_registry TO authenticated;
GRANT SELECT ON public.ai_model_health TO authenticated;
GRANT SELECT, UPDATE ON public.ai_router_settings TO authenticated;
GRANT ALL ON public.ai_model_registry TO service_role;
GRANT ALL ON public.ai_model_health TO service_role;
GRANT ALL ON public.ai_router_settings TO service_role;

ALTER TABLE public.ai_model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_router_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read model registry" ON public.ai_model_registry;
CREATE POLICY "admins read model registry" ON public.ai_model_registry
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins read model health" ON public.ai_model_health;
CREATE POLICY "admins read model health" ON public.ai_model_health
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins read router settings" ON public.ai_router_settings;
CREATE POLICY "admins read router settings" ON public.ai_router_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update router settings" ON public.ai_router_settings;
CREATE POLICY "admins update router settings" ON public.ai_router_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

UPDATE public.ao_agents
  SET addons = coalesce(addons, '{}'::jsonb) || '{"brain7": true}'::jsonb,
      model = 'auto';
