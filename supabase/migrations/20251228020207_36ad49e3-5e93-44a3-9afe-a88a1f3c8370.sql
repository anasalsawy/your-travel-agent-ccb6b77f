-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can update own pending requests" ON public.ticket_requests;

-- Create a new policy that allows users to update their own requests when:
-- 1. Status is 'submitted' (initial request can be edited)
-- 2. Status is 'quoted' (so they can submit payment info)
CREATE POLICY "Users can update own requests for payment" 
ON public.ticket_requests 
FOR UPDATE 
USING (
  auth.uid() = user_id 
  AND status IN ('submitted'::ticket_request_status, 'quoted'::ticket_request_status)
)
WITH CHECK (
  auth.uid() = user_id 
  AND status IN ('submitted'::ticket_request_status, 'quoted'::ticket_request_status)
);