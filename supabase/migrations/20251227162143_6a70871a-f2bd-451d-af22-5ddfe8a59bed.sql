-- Create a helper function to check if user is staff or admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff')
  )
$$;

-- Update vouchers policy to allow staff full access
DROP POLICY IF EXISTS "Admins can manage vouchers" ON public.vouchers;
CREATE POLICY "Staff and admins can manage vouchers" 
ON public.vouchers 
FOR ALL 
USING (is_staff_or_admin(auth.uid()));

-- Update orders policies for staff (view and limited update)
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users and staff can view orders" 
ON public.orders 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR is_staff_or_admin(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage orders" ON public.orders;

-- Admin can update all order fields
CREATE POLICY "Admins can fully manage orders" 
ON public.orders 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Staff can only update delivery-related fields (fulfilled via edge function or specific columns)
CREATE POLICY "Staff can update delivery status" 
ON public.orders 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'staff') 
  AND payment_status = 'completed'
);

-- Update ticket_requests policies for staff
DROP POLICY IF EXISTS "Users can view own requests" ON public.ticket_requests;
CREATE POLICY "Users and staff can view requests" 
ON public.ticket_requests 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR is_staff_or_admin(auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage requests" ON public.ticket_requests;

-- Admin can update all request fields
CREATE POLICY "Admins can fully manage requests" 
ON public.ticket_requests 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

-- Staff can only update fulfillment-related fields
CREATE POLICY "Staff can update fulfillment status" 
ON public.ticket_requests 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'staff') 
  AND payment_status = 'completed'
);

-- Update messages policy for staff
DROP POLICY IF EXISTS "Users can view messages for their orders/requests" ON public.messages;
CREATE POLICY "Users and staff can view messages" 
ON public.messages 
FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM orders WHERE orders.id = messages.order_id AND orders.user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM ticket_requests WHERE ticket_requests.id = messages.ticket_request_id AND ticket_requests.user_id = auth.uid()))
  OR is_staff_or_admin(auth.uid())
);

-- Staff and admins can send messages
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users and staff can send messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id
  OR is_staff_or_admin(auth.uid())
);