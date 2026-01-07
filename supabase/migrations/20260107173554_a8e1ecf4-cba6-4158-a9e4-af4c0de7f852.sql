-- Create seller_reviews table for rating sellers after completed transactions
CREATE TABLE public.seller_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  bid_id UUID NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(bid_id, reviewer_id)
);

-- Enable RLS
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews
CREATE POLICY "Anyone can view seller reviews"
ON public.seller_reviews FOR SELECT
USING (true);

-- Only the buyer who accepted the bid can create a review
CREATE POLICY "Buyers can create reviews for accepted bids"
ON public.seller_reviews FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id
  AND EXISTS (
    SELECT 1 FROM public.bids b
    JOIN public.marketplace_listings ml ON b.listing_id = ml.id
    WHERE b.id = bid_id
    AND b.status = 'accepted'
    AND ml.user_id = auth.uid()
  )
);

-- Reviewers can update their own reviews
CREATE POLICY "Reviewers can update own reviews"
ON public.seller_reviews FOR UPDATE
USING (auth.uid() = reviewer_id);

-- Reviewers can delete their own reviews
CREATE POLICY "Reviewers can delete own reviews"
ON public.seller_reviews FOR DELETE
USING (auth.uid() = reviewer_id);

-- Add trigger for updated_at using the existing function
CREATE TRIGGER update_seller_reviews_updated_at
BEFORE UPDATE ON public.seller_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();