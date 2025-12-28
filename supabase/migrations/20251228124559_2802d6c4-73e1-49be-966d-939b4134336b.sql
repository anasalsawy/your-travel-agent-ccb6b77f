-- Add split payment fields to ticket_requests table
-- Feature flag controlled via site_settings

-- Add payment_plan column
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS payment_plan text NOT NULL DEFAULT 'full' 
CHECK (payment_plan IN ('full', 'deposit'));

-- Add deposit and balance amounts
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT NULL;

ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS balance_amount numeric DEFAULT NULL;

-- Add balance due date
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS balance_due_date date DEFAULT NULL;

-- Add deposit status
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'not_paid'
CHECK (deposit_status IN ('not_paid', 'under_review', 'approved', 'rejected'));

-- Add balance status
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS balance_status text NOT NULL DEFAULT 'not_due'
CHECK (balance_status IN ('not_due', 'due', 'under_review', 'approved', 'rejected', 'past_due'));

-- Add deposit proof URL (separate from main proof for tracking)
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS deposit_proof_url text DEFAULT NULL;

-- Add balance proof URL
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS balance_proof_url text DEFAULT NULL;

-- Insert the feature flag setting (default OFF)
INSERT INTO public.site_settings (key, value)
VALUES ('enable_split_payments', 'false')
ON CONFLICT (key) DO NOTHING;