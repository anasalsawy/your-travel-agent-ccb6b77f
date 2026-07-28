ALTER TABLE public.nyop_bids
  ADD COLUMN IF NOT EXISTS children_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infants_count integer NOT NULL DEFAULT 0;