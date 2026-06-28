
CREATE TABLE public.admin_duffel_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  duffel_card_id TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  exp_month INT,
  exp_year INT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_test BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_duffel_cards TO authenticated;
GRANT ALL ON public.admin_duffel_cards TO service_role;
ALTER TABLE public.admin_duffel_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage duffel cards" ON public.admin_duffel_cards FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
