-- Add billing details to gift_cards for automated booking
ALTER TABLE public.gift_cards
ADD COLUMN IF NOT EXISTS billing_address TEXT,
ADD COLUMN IF NOT EXISTS billing_city TEXT,
ADD COLUMN IF NOT EXISTS billing_state TEXT,
ADD COLUMN IF NOT EXISTS billing_zip TEXT,
ADD COLUMN IF NOT EXISTS billing_country TEXT DEFAULT 'US',
ADD COLUMN IF NOT EXISTS cardholder_name TEXT,
ADD COLUMN IF NOT EXISTS card_number_encrypted TEXT,
ADD COLUMN IF NOT EXISTS card_exp_month TEXT,
ADD COLUMN IF NOT EXISTS card_exp_year TEXT,
ADD COLUMN IF NOT EXISTS card_cvv_encrypted TEXT;

-- Add link from quote_logs to ticket_requests and inventory
ALTER TABLE public.quote_logs
ADD COLUMN IF NOT EXISTS ticket_request_id UUID REFERENCES public.ticket_requests(id),
ADD COLUMN IF NOT EXISTS inventory_type TEXT,
ADD COLUMN IF NOT EXISTS inventory_id UUID,
ADD COLUMN IF NOT EXISTS alaska_available BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS booking_method TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quote_logs_ticket_request ON public.quote_logs(ticket_request_id);
CREATE INDEX IF NOT EXISTS idx_quote_logs_conversation ON public.quote_logs(conversation_id);

-- Create booking_queue table for pending automated bookings
CREATE TABLE IF NOT EXISTS public.booking_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID REFERENCES public.quote_logs(id),
  ticket_request_id UUID REFERENCES public.ticket_requests(id),
  status TEXT NOT NULL DEFAULT 'pending',
  booking_method TEXT NOT NULL,
  inventory_type TEXT NOT NULL,
  inventory_id UUID,
  priority INTEGER DEFAULT 1,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  call_log_id UUID REFERENCES public.call_logs(id),
  booking_result JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on booking_queue
ALTER TABLE public.booking_queue ENABLE ROW LEVEL SECURITY;

-- Only admins/staff can manage booking queue
CREATE POLICY "Staff and admins can manage booking queue"
ON public.booking_queue
FOR ALL
USING (is_staff_or_admin(auth.uid()));

-- System can insert/update booking queue
CREATE POLICY "System can insert booking queue"
ON public.booking_queue
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update booking queue"
ON public.booking_queue
FOR UPDATE
USING (true);