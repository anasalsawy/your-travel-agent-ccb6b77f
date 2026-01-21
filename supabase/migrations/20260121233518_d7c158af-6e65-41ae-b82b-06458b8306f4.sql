-- Create call_logs table to track all outbound booking calls
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_request_id UUID REFERENCES public.ticket_requests(id) ON DELETE SET NULL,
  
  -- Call identification
  call_sid TEXT,
  conversation_id TEXT,
  
  -- Call details
  airline TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  call_type TEXT DEFAULT 'airline_booking',
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'initiated',
  -- Status values: initiated, ringing, in_progress, completed, failed, no_answer
  
  -- Booking outcome
  confirmation_number TEXT,
  booked_price NUMERIC,
  booked_flight_info TEXT,
  
  -- Transcript and notes
  transcript TEXT,
  call_summary TEXT,
  admin_notes TEXT,
  
  -- Customer info for the call
  customer_email TEXT,
  customer_phone TEXT,
  passenger_names TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Admins and staff can manage call logs
CREATE POLICY "Staff and admins can manage call logs"
ON public.call_logs
FOR ALL
USING (is_staff_or_admin(auth.uid()));

-- System can insert call logs (for edge functions)
CREATE POLICY "System can insert call logs"
ON public.call_logs
FOR INSERT
WITH CHECK (true);

-- System can update call logs (for webhooks)
CREATE POLICY "System can update call logs"
ON public.call_logs
FOR UPDATE
USING (true);

-- Add call_status column to ticket_requests for quick status check
ALTER TABLE public.ticket_requests 
ADD COLUMN IF NOT EXISTS active_call_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_call_logs_ticket_request ON public.call_logs(ticket_request_id);
CREATE INDEX idx_call_logs_status ON public.call_logs(status);
CREATE INDEX idx_call_logs_call_sid ON public.call_logs(call_sid);

-- Trigger to update updated_at
CREATE TRIGGER update_call_logs_updated_at
BEFORE UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();