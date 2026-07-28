
CREATE TABLE public.nyop_bids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  trip_type TEXT NOT NULL DEFAULT 'round-trip',
  passengers INTEGER NOT NULL DEFAULT 1,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  bid_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  flex_dates_days INTEGER NOT NULL DEFAULT 0,
  flex_airline BOOLEAN NOT NULL DEFAULT true,
  flex_stops BOOLEAN NOT NULL DEFAULT true,
  wait_window_hours INTEGER NOT NULL DEFAULT 24,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'hunting',
  best_offer_seen_amount NUMERIC,
  best_offer_seen_id TEXT,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_hunt_at TIMESTAMPTZ,
  matched_offer_id TEXT,
  matched_offer_amount NUMERIC,
  matched_at TIMESTAMPTZ,
  duffel_booking_id UUID,
  booking_reference TEXT,
  special_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX nyop_bids_status_expires ON public.nyop_bids(status, expires_at);
CREATE INDEX nyop_bids_user ON public.nyop_bids(user_id);

GRANT SELECT, INSERT, UPDATE ON public.nyop_bids TO authenticated;
GRANT SELECT ON public.nyop_bids TO anon;
GRANT ALL ON public.nyop_bids TO service_role;

ALTER TABLE public.nyop_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own bids"
  ON public.nyop_bids FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users view their own bids"
  ON public.nyop_bids FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anon can view any single bid by id"
  ON public.nyop_bids FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Owners can update their own bids"
  ON public.nyop_bids FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER nyop_bids_updated_at
  BEFORE UPDATE ON public.nyop_bids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
