-- Drop the existing restrictive policy for user updates
DROP POLICY IF EXISTS "Users can update own requests for payment" ON public.ticket_requests;

-- Create a new policy that allows users to update their own requests:
-- 1. When status is 'submitted' or 'quoted' (for initial payment)
-- 2. When status is 'ticketed' AND balance_status is 'due' or 'past_due' (for balance payment)
CREATE POLICY "Users can update own requests for payment" 
ON public.ticket_requests 
FOR UPDATE 
USING (
  auth.uid() = user_id AND (
    -- Allow updates during initial payment flow
    status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status])
    OR
    -- Allow updates for balance payment when ticket is issued
    (status = 'ticketed'::ticket_request_status AND balance_status IN ('due', 'past_due', 'rejected'))
  )
)
WITH CHECK (
  auth.uid() = user_id AND (
    -- Allow updates during initial payment flow
    status = ANY (ARRAY['submitted'::ticket_request_status, 'quoted'::ticket_request_status])
    OR
    -- Allow updates for balance payment when ticket is issued
    (status = 'ticketed'::ticket_request_status AND balance_status IN ('due', 'past_due', 'rejected'))
  )
);