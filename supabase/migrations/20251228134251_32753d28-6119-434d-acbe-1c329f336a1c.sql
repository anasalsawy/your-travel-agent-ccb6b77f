-- Broaden ownership check for ticket_requests updates to handle legacy rows with null user_id
-- Allows authenticated user to update their own request if either user_id matches OR contact_email matches JWT email.

DROP POLICY IF EXISTS "Users can update own requests for payment" ON public.ticket_requests;

CREATE POLICY "Users can update own requests for payment"
ON public.ticket_requests
FOR UPDATE
USING (
  (
    auth.uid() = user_id
    OR lower(contact_email) = lower((auth.jwt() ->> 'email'))
  )
  AND (
    (status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status]))
    OR (
      (status = 'ticketed'::ticket_request_status)
      AND (balance_status = ANY (ARRAY['due'::text, 'past_due'::text, 'rejected'::text, 'under_review'::text]))
    )
  )
)
WITH CHECK (
  (
    auth.uid() = user_id
    OR lower(contact_email) = lower((auth.jwt() ->> 'email'))
  )
  AND (
    (status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status]))
    OR (
      (status = 'ticketed'::ticket_request_status)
      AND (balance_status = ANY (ARRAY['due'::text, 'past_due'::text, 'rejected'::text, 'under_review'::text]))
    )
  )
);
