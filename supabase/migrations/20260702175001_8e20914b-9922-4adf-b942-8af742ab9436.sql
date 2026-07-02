
CREATE TABLE public.shopper_profile (
  id INT PRIMARY KEY DEFAULT 1,
  payment_ref TEXT,
  payment_last4 TEXT,
  payment_brand TEXT,
  ship_to JSONB NOT NULL DEFAULT '{}'::jsonb,
  bill_to JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_daily_cap_usd NUMERIC DEFAULT 2000,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shopper_profile_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopper_profile TO authenticated;
GRANT ALL ON public.shopper_profile TO service_role;
ALTER TABLE public.shopper_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage shopper profile"
  ON public.shopper_profile FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.shopper_profile (id, ship_to, bill_to, notes)
VALUES (
  1,
  '{"name":"Anas Alsawy","line1":"","city":"Houston","state":"TX","postal_code":"","country":"US","phone":"+17134698336","email":"anasalsawy@gmail.com"}'::jsonb,
  '{"name":"Anas Alsawy","line1":"","city":"Houston","state":"TX","postal_code":"","country":"US","phone":"+17134698336","email":"anasalsawy@gmail.com"}'::jsonb,
  'Fill in line1 + postal_code in /admin (Shopper Profile) before first live checkout.'
) ON CONFLICT (id) DO NOTHING;
