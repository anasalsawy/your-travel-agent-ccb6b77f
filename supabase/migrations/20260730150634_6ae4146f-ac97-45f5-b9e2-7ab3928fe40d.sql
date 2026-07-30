CREATE TABLE public.ao_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'leads',
  channel text NOT NULL DEFAULT 'meta',
  status text NOT NULL DEFAULT 'draft',
  daily_budget_usd numeric NOT NULL DEFAULT 20,
  lifetime_cap_usd numeric NOT NULL DEFAULT 300,
  spend_usd numeric NOT NULL DEFAULT 0,
  landing_path text NOT NULL DEFAULT '/name-your-price',
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  kpi jsonb NOT NULL DEFAULT '{}'::jsonb,
  autonomy text NOT NULL DEFAULT 'propose',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_campaigns TO authenticated;
GRANT ALL ON public.ao_campaigns TO service_role;
ALTER TABLE public.ao_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage campaigns" ON public.ao_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ao_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ao_campaigns(id) ON DELETE CASCADE,
  angle text NOT NULL DEFAULT 'value',
  headline text NOT NULL,
  primary_text text NOT NULL,
  description text,
  cta text NOT NULL DEFAULT 'LEARN_MORE',
  image_prompt text,
  image_url text,
  status text NOT NULL DEFAULT 'draft',
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_creatives TO authenticated;
GRANT ALL ON public.ao_creatives TO service_role;
ALTER TABLE public.ao_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage creatives" ON public.ao_creatives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ao_ad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ao_campaigns(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES public.ao_creatives(id) ON DELETE SET NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  spend_usd numeric NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  bookings integer NOT NULL DEFAULT 0,
  revenue_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, creative_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_ad_metrics TO authenticated;
GRANT ALL ON public.ao_ad_metrics TO service_role;
ALTER TABLE public.ao_ad_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ad metrics" ON public.ao_ad_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ao_site_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'copy',
  title text NOT NULL,
  detail text,
  target_path text,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'proposed',
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_site_tasks TO authenticated;
GRANT ALL ON public.ao_site_tasks TO service_role;
ALTER TABLE public.ao_site_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage site tasks" ON public.ao_site_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER ao_campaigns_updated BEFORE UPDATE ON public.ao_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_creatives_updated BEFORE UPDATE ON public.ao_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_ad_metrics_updated BEFORE UPDATE ON public.ao_ad_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ao_site_tasks_updated BEFORE UPDATE ON public.ao_site_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();