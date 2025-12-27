-- Create notification_log table for tracking email attempts
CREATE TABLE public.notification_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  record_id UUID,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view notification logs"
ON public.notification_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to send notification via edge function
CREATE OR REPLACE FUNCTION public.trigger_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  payload JSONB;
  notification_type TEXT;
  edge_function_url TEXT;
  log_id UUID;
BEGIN
  -- Determine notification type based on trigger
  IF TG_TABLE_NAME = 'ticket_requests' AND TG_OP = 'INSERT' THEN
    notification_type := 'new_ticket_request';
    payload := jsonb_build_object(
      'type', notification_type,
      'data', jsonb_build_object(
        'origin', NEW.origin,
        'destination', NEW.destination,
        'departureDate', NEW.departure_date,
        'returnDate', NEW.return_date,
        'passengers', NEW.passengers,
        'cabinClass', NEW.cabin_class,
        'budget', NEW.budget,
        'contactEmail', NEW.contact_email
      )
    );
  ELSIF TG_TABLE_NAME = 'orders' AND TG_OP = 'INSERT' THEN
    notification_type := 'new_order';
    payload := jsonb_build_object(
      'type', notification_type,
      'data', jsonb_build_object(
        'orderId', NEW.id,
        'amount', NEW.amount_paid,
        'paymentMethod', NEW.payment_method,
        'voucherId', NEW.voucher_id
      )
    );
  ELSIF TG_TABLE_NAME = 'orders' AND TG_OP = 'UPDATE' AND NEW.proof_upload_url IS NOT NULL AND (OLD.proof_upload_url IS NULL OR OLD.proof_upload_url <> NEW.proof_upload_url) THEN
    notification_type := 'payment_proof_uploaded';
    payload := jsonb_build_object(
      'type', notification_type,
      'data', jsonb_build_object(
        'orderId', NEW.id,
        'amount', NEW.amount_paid,
        'paymentMethod', NEW.payment_method,
        'proofUrl', NEW.proof_upload_url
      )
    );
  ELSE
    RETURN NEW;
  END IF;

  -- Log the attempt
  INSERT INTO public.notification_log (event_type, record_id, status, payload)
  VALUES (notification_type, NEW.id, 'pending', payload)
  RETURNING id INTO log_id;

  -- Build edge function URL
  edge_function_url := 'https://wpwdxtyufpewdyffxlgo.supabase.co/functions/v1/send-notification';

  -- Call edge function via pg_net
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := payload::TEXT,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
    )::JSONB
  );

  -- Update log status
  UPDATE public.notification_log SET status = 'sent' WHERE id = log_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error
  UPDATE public.notification_log SET status = 'error', error = SQLERRM WHERE id = log_id;
  RETURN NEW;
END;
$$;

-- Create trigger for ticket_requests INSERT
CREATE TRIGGER on_ticket_request_created
AFTER INSERT ON public.ticket_requests
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notification();

-- Create trigger for orders INSERT
CREATE TRIGGER on_order_created
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notification();

-- Create trigger for orders UPDATE (payment proof)
CREATE TRIGGER on_payment_proof_uploaded
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (NEW.proof_upload_url IS DISTINCT FROM OLD.proof_upload_url AND NEW.proof_upload_url IS NOT NULL)
EXECUTE FUNCTION public.trigger_notification();