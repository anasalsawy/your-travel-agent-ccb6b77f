-- Fix balance proof submission: allow customer to set balance_status to under_review on their own ticketed request

DROP POLICY IF EXISTS "Users can update own requests for payment" ON public.ticket_requests;

CREATE POLICY "Users can update own requests for payment"
ON public.ticket_requests
FOR UPDATE
USING (
  (auth.uid() = user_id)
  AND (
    (status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status]))
    OR (
      (status = 'ticketed'::ticket_request_status)
      AND (balance_status = ANY (ARRAY['due'::text, 'past_due'::text, 'rejected'::text, 'under_review'::text]))
    )
  )
)
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    (status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status]))
    OR (
      (status = 'ticketed'::ticket_request_status)
      AND (balance_status = ANY (ARRAY['due'::text, 'past_due'::text, 'rejected'::text, 'under_review'::text]))
    )
  )
);
