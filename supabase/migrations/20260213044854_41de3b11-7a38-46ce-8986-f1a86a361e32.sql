
-- Create car rental requests table
CREATE TABLE public.car_rental_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT,
  pickup_date DATE NOT NULL,
  pickup_time TIME,
  dropoff_date DATE NOT NULL,
  dropoff_time TIME,
  car_type TEXT DEFAULT 'economy',
  transmission TEXT DEFAULT 'automatic',
  rental_company TEXT,
  drivers_age INTEGER DEFAULT 25,
  num_drivers INTEGER DEFAULT 1,
  needs_insurance BOOLEAN DEFAULT false,
  needs_gps BOOLEAN DEFAULT false,
  needs_child_seat BOOLEAN DEFAULT false,
  budget NUMERIC,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  special_notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  quoted_price NUMERIC,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.car_rental_requests ENABLE ROW LEVEL SECURITY;

-- Users can create their own requests
CREATE POLICY "Users can create car rental requests"
ON public.car_rental_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own car rental requests"
ON public.car_rental_requests
FOR SELECT
USING (auth.uid() = user_id OR is_staff_or_admin(auth.uid()));

-- Users can update own submitted requests
CREATE POLICY "Users can update own car rental requests"
ON public.car_rental_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'submitted');

-- Admins can fully manage
CREATE POLICY "Admins can manage car rental requests"
ON public.car_rental_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_car_rental_requests_updated_at
BEFORE UPDATE ON public.car_rental_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
