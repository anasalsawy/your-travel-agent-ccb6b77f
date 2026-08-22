CREATE TABLE public.flight_deals (
  id uuid primary key default gen_random_uuid(),
  deal_key text not null unique,
  departure_id text not null,
  destination_name text,
  country text,
  departure_airport_code text,
  arrival_airport_code text,
  airline text,
  airline_code text,
  stops integer,
  flight_duration integer,
  outbound_date text,
  return_date text,
  trip_type text default 'round_trip',
  currency text not null default 'USD',
  source_price numeric not null,
  our_price numeric not null,
  flight_link text,
  image_url text,
  is_active boolean not null default true,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

CREATE INDEX flight_deals_active_idx ON public.flight_deals (is_active, our_price);
CREATE INDEX flight_deals_fetched_idx ON public.flight_deals (fetched_at DESC);

GRANT SELECT ON public.flight_deals TO anon;
GRANT SELECT ON public.flight_deals TO authenticated;
GRANT ALL ON public.flight_deals TO service_role;

ALTER TABLE public.flight_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active flight deals"
ON public.flight_deals FOR SELECT
TO anon, authenticated
USING (is_active = true);