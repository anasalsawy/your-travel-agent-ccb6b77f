-- Drop and recreate the trigger function with correct pg_net syntax
CREATE OR REPLACE FUNCTION public.trigger_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload JSONB;
  notification_type TEXT;
  edge_function_url TEXT;
  log_id UUID;
  request_id BIGINT;
BEGIN
  -- Determine notification type based on trigger
  IF TG_TABLE_NAME = 'ticket_requests' AND TG_OP = 'INSERT' THEN
    notification_type := 'new_ticket_request';
    payload := jsonb_build_object(
      'type', notification_type,
      'data', jsonb_build_object(
        'origin', NEW.origin,
        'destination', NEW.destination,
        'departureDate', NEW.departure_date::TEXT,
        'returnDate', NEW.return_date::TEXT,
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
        'orderId', NEW.id::TEXT,
        'amount', NEW.amount_paid,
        'paymentMethod', NEW.payment_method,
        'voucherId', NEW.voucher_id::TEXT
      )
    );
  ELSIF TG_TABLE_NAME = 'orders' AND TG_OP = 'UPDATE' AND NEW.proof_upload_url IS NOT NULL AND (OLD.proof_upload_url IS NULL OR OLD.proof_upload_url <> NEW.proof_upload_url) THEN
    notification_type := 'payment_proof_uploaded';
    payload := jsonb_build_object(
      'type', notification_type,
      'data', jsonb_build_object(
        'orderId', NEW.id::TEXT,
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

  -- Call edge function via pg_net (correct function signature)
  SELECT net.http_post(
    url := edge_function_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
    )
  ) INTO request_id;

  -- Update log status
  UPDATE public.notification_log SET status = 'sent' WHERE id = log_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error if we have a log_id
  IF log_id IS NOT NULL THEN
    UPDATE public.notification_log SET status = 'error', error = SQLERRM WHERE id = log_id;
  ELSE
    INSERT INTO public.notification_log (event_type, record_id, status, error, payload)
    VALUES (COALESCE(notification_type, 'unknown'), NEW.id, 'error', SQLERRM, payload);
  END IF;
  RETURN NEW;
END;
$$;