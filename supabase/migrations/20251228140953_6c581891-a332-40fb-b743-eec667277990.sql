-- Add ticket_request_id and type columns to payment_proofs
ALTER TABLE public.payment_proofs 
  ADD COLUMN ticket_request_id uuid REFERENCES public.ticket_requests(id),
  ADD COLUMN type text DEFAULT 'deposit';

-- Make order_id nullable since ticket request proofs won't have one
ALTER TABLE public.payment_proofs 
  ALTER COLUMN order_id DROP NOT NULL;

-- Add index for faster lookups
CREATE INDEX idx_payment_proofs_ticket_request ON public.payment_proofs(ticket_request_id);

-- Update RLS policy to allow staff/admins to see all proofs (already exists)
-- Add policy for users to insert ticket request proofs
CREATE POLICY "Users can create ticket request proofs" 
ON public.payment_proofs 
FOR INSERT 
WITH CHECK (
  (user_id = auth.uid()) 
  AND (
    (ticket_request_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM ticket_requests tr 
      WHERE tr.id = payment_proofs.ticket_request_id 
      AND (tr.user_id = auth.uid() OR lower(tr.contact_email) = lower(auth.jwt() ->> 'email'))
    ))
    OR 
    (order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders o WHERE o.id = payment_proofs.order_id AND o.user_id = auth.uid()
    ))
  )
);

-- Drop old restrictive policy and recreate
DROP POLICY IF EXISTS "Users can create own payment proofs" ON public.payment_proofs;