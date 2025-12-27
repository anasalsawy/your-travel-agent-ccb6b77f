-- Add order payment under-review state + attempt tracking + notification dedupe

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payment_status' AND e.enumlabel = 'under_review'
  ) THEN
    ALTER TYPE public.payment_status ADD VALUE 'under_review';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'order_status' AND e.enumlabel = 'payment_under_review'
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'payment_under_review';
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS payment_attempt_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Dedupe notification attempts per payment attempt (record_id + event + recipient + attempt)
CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedupe_payment_attempt
ON public.notification_log (
  record_id,
  event_type,
  recipient,
  (payload->>'paymentAttemptId')
)
WHERE record_id IS NOT NULL
  AND recipient IS NOT NULL
  AND payload ? 'paymentAttemptId';

-- Update trigger_notification to:
-- - send customer "payment_under_review" exactly once per payment attempt
-- - include paymentAttemptId in payload for dedupe
CREATE OR REPLACE FUNCTION public.trigger_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload JSONB;
  edge_function_url TEXT;
  request_id BIGINT;
  customer_email TEXT;
  entity_type TEXT;
  entity_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    entity_type := 'order';
    entity_id := NEW.id::TEXT;
    customer_email := NEW.customer_email;
  ELSIF TG_TABLE_NAME = 'ticket_requests' THEN
    entity_type := 'ticket_request';
    entity_id := NEW.id::TEXT;
    customer_email := NEW.contact_email;
  END IF;

  edge_function_url := 'https://wpwdxtyufpewdyffxlgo.supabase.co/functions/v1/send-notification';

  -- ================== ORDERS ==================
  IF TG_TABLE_NAME = 'orders' THEN

    -- INSERT: New order created
    IF TG_OP = 'INSERT' THEN
      -- Customer: order received
      payload := jsonb_build_object(
        'type', 'order_received',
        'data', jsonb_build_object(
          'orderId', NEW.id::TEXT,
          'amount', NEW.amount_paid,
          'paymentMethod', NEW.payment_method,
          'voucherId', NEW.voucher_id::TEXT,
          'paymentAttemptId', NEW.payment_attempt_id::TEXT
        ),
        'customerEmail', customer_email,
        'entityType', entity_type,
        'entityId', entity_id
      );

      INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
      VALUES ('order_received', NEW.id, 'pending', payload, customer_email)
      ON CONFLICT DO NOTHING;

      IF customer_email IS NOT NULL THEN
        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      -- Admin: new order
      payload := jsonb_build_object(
        'type', 'admin_new_order',
        'data', jsonb_build_object(
          'orderId', NEW.id::TEXT,
          'amount', NEW.amount_paid,
          'paymentMethod', NEW.payment_method,
          'voucherId', NEW.voucher_id::TEXT,
          'customerEmail', customer_email,
          'paymentAttemptId', NEW.payment_attempt_id::TEXT
        ),
        'entityType', entity_type,
        'entityId', entity_id
      );

      INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
      VALUES ('admin_new_order', NEW.id, 'pending', payload, 'admin')
      ON CONFLICT DO NOTHING;

      SELECT net.http_post(
        url := edge_function_url,
        body := payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
        )
      ) INTO request_id;

      -- If the order is created directly in under_review (proof submitted in same flow), notify customer once
      IF NEW.payment_status = 'under_review' THEN
        payload := jsonb_build_object(
          'type', 'payment_under_review',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'paymentMethod', NEW.payment_method,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('payment_under_review', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        -- Admin proof notification (so admin sees it's under review immediately)
        payload := jsonb_build_object(
          'type', 'admin_proof_uploaded',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'paymentMethod', NEW.payment_method,
            'proofUrl', NEW.proof_upload_url,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_proof_uploaded', NEW.id, 'pending', payload, 'admin')
        ON CONFLICT DO NOTHING;

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

    -- UPDATE: Meaningful transitions
    ELSIF TG_OP = 'UPDATE' THEN

      -- Payment entered under_review (idempotent per paymentAttemptId)
      IF NEW.payment_status = 'under_review' AND OLD.payment_status IS DISTINCT FROM 'under_review' THEN
        payload := jsonb_build_object(
          'type', 'payment_under_review',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'paymentMethod', NEW.payment_method,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('payment_under_review', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Admin proof uploaded (if proof path changes)
      IF NEW.proof_upload_url IS NOT NULL AND (OLD.proof_upload_url IS NULL OR OLD.proof_upload_url IS DISTINCT FROM NEW.proof_upload_url) THEN
        payload := jsonb_build_object(
          'type', 'admin_proof_uploaded',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'paymentMethod', NEW.payment_method,
            'proofUrl', NEW.proof_upload_url,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_proof_uploaded', NEW.id, 'pending', payload, 'admin')
        ON CONFLICT DO NOTHING;

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      -- Payment approved
      IF NEW.payment_status = 'completed' AND OLD.payment_status IS DISTINCT FROM 'completed' THEN
        payload := jsonb_build_object(
          'type', 'payment_approved',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'voucherId', NEW.voucher_id::TEXT,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('payment_approved', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Payment rejected
      IF NEW.payment_status = 'failed' AND OLD.payment_status IS DISTINCT FROM 'failed' THEN
        payload := jsonb_build_object(
          'type', 'payment_rejected',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'amount', NEW.amount_paid,
            'rejectionReason', NEW.admin_notes,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('payment_rejected', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Order delivered
      IF NEW.order_status = 'delivered' AND OLD.order_status IS DISTINCT FROM 'delivered' THEN
        payload := jsonb_build_object(
          'type', 'order_delivered',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'deliveryInfo', NEW.delivery_info,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('order_delivered', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        payload := jsonb_build_object(
          'type', 'admin_order_delivered',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'customerEmail', customer_email,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_order_delivered', NEW.id, 'pending', payload, 'admin')
        ON CONFLICT DO NOTHING;

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      -- Order cancelled
      IF NEW.order_status = 'cancelled' AND OLD.order_status IS DISTINCT FROM 'cancelled' THEN
        payload := jsonb_build_object(
          'type', 'order_cancelled',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'reason', NEW.admin_notes,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('order_cancelled', NEW.id, 'pending', payload, customer_email)
        ON CONFLICT DO NOTHING;

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicmFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        payload := jsonb_build_object(
          'type', 'admin_order_cancelled',
          'data', jsonb_build_object(
            'orderId', NEW.id::TEXT,
            'reason', NEW.admin_notes,
            'paymentAttemptId', NEW.payment_attempt_id::TEXT
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_order_cancelled', NEW.id, 'pending', payload, 'admin')
        ON CONFLICT DO NOTHING;

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

    END IF;

  -- ================== TICKET REQUESTS ==================
  ELSIF TG_TABLE_NAME = 'ticket_requests' THEN
    -- Keep existing ticket request notification behavior (unchanged)

    IF TG_OP = 'INSERT' THEN
      payload := jsonb_build_object(
        'type', 'ticket_request_received',
        'data', jsonb_build_object(
          'requestId', NEW.id::TEXT,
          'origin', NEW.origin,
          'destination', NEW.destination,
          'departureDate', NEW.departure_date::TEXT,
          'returnDate', NEW.return_date::TEXT,
          'passengers', NEW.passengers,
          'cabinClass', NEW.cabin_class
        ),
        'customerEmail', customer_email,
        'entityType', entity_type,
        'entityId', entity_id
      );

      INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
      VALUES ('ticket_request_received', NEW.id, 'pending', payload, customer_email);

      IF customer_email IS NOT NULL THEN
        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      payload := jsonb_build_object(
        'type', 'admin_new_ticket_request',
        'data', jsonb_build_object(
          'requestId', NEW.id::TEXT,
          'origin', NEW.origin,
          'destination', NEW.destination,
          'departureDate', NEW.departure_date::TEXT,
          'returnDate', NEW.return_date::TEXT,
          'passengers', NEW.passengers,
          'cabinClass', NEW.cabin_class,
          'budget', NEW.budget,
          'contactEmail', NEW.contact_email
        ),
        'entityType', entity_type,
        'entityId', entity_id
      );

      INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
      VALUES ('admin_new_ticket_request', NEW.id, 'pending', payload, 'admin');

      SELECT net.http_post(
        url := edge_function_url,
        body := payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
        )
      ) INTO request_id;

    ELSIF TG_OP = 'UPDATE' THEN
      -- Quote ready
      IF (NEW.quoted_price IS NOT NULL AND OLD.quoted_price IS NULL) OR
         (NEW.status = 'quoted' AND OLD.status IS DISTINCT FROM 'quoted') THEN
        payload := jsonb_build_object(
          'type', 'ticket_quote_ready',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'quotedPrice', NEW.quoted_price
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_quote_ready', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

      ELSIF NEW.quoted_price IS NOT NULL AND OLD.quoted_price IS NOT NULL AND NEW.quoted_price IS DISTINCT FROM OLD.quoted_price THEN
        payload := jsonb_build_object(
          'type', 'ticket_quote_updated',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'quotedPrice', NEW.quoted_price,
            'previousPrice', OLD.quoted_price
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_quote_updated', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Payment proof uploaded for ticket
      IF NEW.proof_upload_url IS NOT NULL AND (OLD.proof_upload_url IS NULL OR OLD.proof_upload_url IS DISTINCT FROM NEW.proof_upload_url) THEN
        payload := jsonb_build_object(
          'type', 'ticket_payment_under_review',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'quotedPrice', NEW.quoted_price
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_payment_under_review', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        payload := jsonb_build_object(
          'type', 'admin_ticket_proof_uploaded',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'proofUrl', NEW.proof_upload_url,
            'quotedPrice', NEW.quoted_price
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_ticket_proof_uploaded', NEW.id, 'pending', payload, 'admin');

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      -- Payment approved for ticket
      IF NEW.payment_status = 'completed' AND OLD.payment_status IS DISTINCT FROM 'completed' THEN
        payload := jsonb_build_object(
          'type', 'ticket_payment_approved',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'quotedPrice', NEW.quoted_price
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_payment_approved', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Payment rejected for ticket
      IF NEW.payment_status = 'failed' AND OLD.payment_status IS DISTINCT FROM 'failed' THEN
        payload := jsonb_build_object(
          'type', 'ticket_payment_rejected',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'quotedPrice', NEW.quoted_price,
            'rejectionReason', NEW.admin_notes
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_payment_rejected', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;
      END IF;

      -- Ticket issued
      IF (NEW.status = 'ticketed' AND OLD.status IS DISTINCT FROM 'ticketed') OR
         (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
        payload := jsonb_build_object(
          'type', 'ticket_issued',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'origin', NEW.origin,
            'destination', NEW.destination,
            'departureDate', NEW.departure_date::TEXT,
            'issuedTicketInfo', NEW.issued_ticket_info
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_issued', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        payload := jsonb_build_object(
          'type', 'admin_ticket_completed',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'customerEmail', customer_email
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_ticket_completed', NEW.id, 'pending', payload, 'admin');

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

      -- Ticket request cancelled
      IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
        payload := jsonb_build_object(
          'type', 'ticket_request_cancelled',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'reason', NEW.admin_notes
          ),
          'customerEmail', customer_email,
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('ticket_request_cancelled', NEW.id, 'pending', payload, customer_email);

        IF customer_email IS NOT NULL THEN
          SELECT net.http_post(
            url := edge_function_url,
            body := payload,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
            )
          ) INTO request_id;
        END IF;

        payload := jsonb_build_object(
          'type', 'admin_ticket_rejected',
          'data', jsonb_build_object(
            'requestId', NEW.id::TEXT,
            'reason', NEW.admin_notes
          ),
          'entityType', entity_type,
          'entityId', entity_id
        );

        INSERT INTO public.notification_log (event_type, record_id, status, payload, recipient)
        VALUES ('admin_ticket_rejected', NEW.id, 'pending', payload, 'admin');

        SELECT net.http_post(
          url := edge_function_url,
          body := payload,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE'
          )
        ) INTO request_id;
      END IF;

    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.notification_log (event_type, record_id, status, error, recipient)
  VALUES ('error', NEW.id, 'error', SQLERRM, 'system');
  RETURN NEW;
END;
$$;