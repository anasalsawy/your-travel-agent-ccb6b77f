-- Add escrow/handoff tracking fields to marketplace_listings
ALTER TABLE public.marketplace_listings 
ADD COLUMN escrow_status text DEFAULT 'none' CHECK (escrow_status IN ('none', 'awaiting_payment', 'funds_held', 'pending_sparefare', 'on_sparefare', 'completed', 'cancelled')),
ADD COLUMN sparefare_listing_url text,
ADD COLUMN travel_date date,
ADD COLUMN escrow_notes text,
ADD COLUMN buyer_notified_at timestamp with time zone,
ADD COLUMN seller_notified_at timestamp with time zone,
ADD COLUMN completed_at timestamp with time zone;

-- Add payment tracking to bids when accepted
ALTER TABLE public.bids
ADD COLUMN payment_proof_url text,
ADD COLUMN payment_verified_at timestamp with time zone,
ADD COLUMN payment_method text CHECK (payment_method IN ('zelle', 'bitcoin', 'paypal'));

-- Create index for escrow status queries
CREATE INDEX idx_listings_escrow_status ON public.marketplace_listings(escrow_status) WHERE escrow_status != 'none';