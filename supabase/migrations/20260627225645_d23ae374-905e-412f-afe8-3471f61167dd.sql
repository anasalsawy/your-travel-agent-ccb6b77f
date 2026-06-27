
CREATE TABLE public.duffel_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  offer_id TEXT NOT NULL,
  duffel_order_id TEXT,
  booking_reference TEXT,
  passengers JSONB NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  wholesale_amount NUMERIC(10,2) NOT NULL,
  wholesale_currency TEXT NOT NULL,
  customer_amount NUMERIC(10,2) NOT NULL,
  customer_currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  stripe_session_id TEXT,
  duffel_order JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.duffel_bookings TO authenticated;
GRANT ALL ON public.duffel_bookings TO service_role;

ALTER TABLE public.duffel_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own duffel bookings"
  ON public.duffel_bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage duffel bookings"
  ON public.duffel_bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_duffel_bookings_user ON public.duffel_bookings(user_id);
CREATE INDEX idx_duffel_bookings_stripe ON public.duffel_bookings(stripe_session_id);
CREATE INDEX idx_duffel_bookings_status ON public.duffel_bookings(status);
