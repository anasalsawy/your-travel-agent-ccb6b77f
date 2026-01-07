-- Create enum for seller status
CREATE TYPE public.seller_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- Create enum for bid status
CREATE TYPE public.bid_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- Create enum for listing status
CREATE TYPE public.listing_status AS ENUM ('open', 'closed', 'awarded', 'expired');

-- Create sellers table for verified travel agents/agencies
CREATE TABLE public.sellers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    description TEXT,
    website TEXT,
    logo_url TEXT,
    status seller_status NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Create marketplace listings (public ticket requests)
CREATE TABLE public.marketplace_listings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_request_id UUID NOT NULL REFERENCES public.ticket_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status listing_status NOT NULL DEFAULT 'open',
    min_bid NUMERIC,
    winning_bid_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(ticket_request_id)
);

-- Create bids table
CREATE TABLE public.bids (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    message TEXT,
    estimated_delivery TEXT,
    conditions TEXT,
    status bid_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add is_public column to ticket_requests for opt-in
ALTER TABLE public.ticket_requests 
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS on all new tables
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- Create function to check if user is an approved seller
CREATE OR REPLACE FUNCTION public.is_approved_seller(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sellers
        WHERE user_id = _user_id AND status = 'approved'
    )
$$;

-- SELLERS RLS POLICIES
CREATE POLICY "Users can apply as seller"
ON public.sellers FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own seller profile"
ON public.sellers FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Approved sellers are publicly visible"
ON public.sellers FOR SELECT
USING (status = 'approved');

CREATE POLICY "Users can update own seller profile"
ON public.sellers FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage sellers"
ON public.sellers FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- MARKETPLACE LISTINGS RLS POLICIES
CREATE POLICY "Anyone can view open listings"
ON public.marketplace_listings FOR SELECT
USING (status = 'open');

CREATE POLICY "Users can create own listings"
ON public.marketplace_listings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings"
ON public.marketplace_listings FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own listings"
ON public.marketplace_listings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage listings"
ON public.marketplace_listings FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- BIDS RLS POLICIES
CREATE POLICY "Approved sellers can bid"
ON public.bids FOR INSERT
TO authenticated
WITH CHECK (
    is_approved_seller(auth.uid()) 
    AND EXISTS (
        SELECT 1 FROM public.sellers 
        WHERE sellers.user_id = auth.uid() AND sellers.id = bids.seller_id
    )
    AND EXISTS (
        SELECT 1 FROM public.marketplace_listings 
        WHERE marketplace_listings.id = bids.listing_id AND marketplace_listings.status = 'open'
    )
);

CREATE POLICY "Sellers can view own bids"
ON public.bids FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.sellers 
        WHERE sellers.user_id = auth.uid() AND sellers.id = bids.seller_id
    )
);

CREATE POLICY "Sellers can update own bids"
ON public.bids FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.sellers 
        WHERE sellers.user_id = auth.uid() AND sellers.id = bids.seller_id
    )
);

CREATE POLICY "Listing owners can view bids"
ON public.bids FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.marketplace_listings 
        WHERE marketplace_listings.id = bids.listing_id AND marketplace_listings.user_id = auth.uid()
    )
);

CREATE POLICY "Listing owners can update bid status"
ON public.bids FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.marketplace_listings 
        WHERE marketplace_listings.id = bids.listing_id AND marketplace_listings.user_id = auth.uid()
    )
);

CREATE POLICY "Admins can manage bids"
ON public.bids FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Create triggers using the existing update_updated_at function
CREATE TRIGGER update_sellers_updated_at
BEFORE UPDATE ON public.sellers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_marketplace_listings_updated_at
BEFORE UPDATE ON public.marketplace_listings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_bids_updated_at
BEFORE UPDATE ON public.bids
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for bids (so buyers see new bids instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;
ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_listings;