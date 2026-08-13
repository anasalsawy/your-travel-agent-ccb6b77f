ALTER TABLE public.ao_leads ADD COLUMN IF NOT EXISTS external_url text;
CREATE UNIQUE INDEX IF NOT EXISTS ao_leads_external_url_uniq ON public.ao_leads (external_url) WHERE external_url IS NOT NULL;