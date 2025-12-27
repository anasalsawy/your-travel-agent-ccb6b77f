-- Create enums
CREATE TYPE public.voucher_status AS ENUM ('available', 'reserved', 'sold', 'disabled');
CREATE TYPE public.voucher_type AS ENUM ('voucher', 'certificate', 'gift_card');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'delivered', 'cancelled', 'refunded');
CREATE TYPE public.payment_method AS ENUM ('stripe', 'bitcoin');
CREATE TYPE public.payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE public.ticket_request_status AS ENUM ('submitted', 'quoted', 'paid', 'ticketed', 'completed', 'cancelled');
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'customer',
  UNIQUE (user_id, role)
);

-- Vouchers table
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airline TEXT NOT NULL,
  title TEXT NOT NULL,
  type voucher_type NOT NULL DEFAULT 'voucher',
  face_value DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  expiry_date DATE,
  discount_percent DECIMAL(5,2) NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  redemption_notes TEXT,
  terms TEXT,
  verified_balance BOOLEAN DEFAULT true,
  verification_method TEXT,
  status voucher_status DEFAULT 'available',
  is_refundable BOOLEAN DEFAULT false,
  is_transferable BOOLEAN DEFAULT true,
  redemption_method TEXT DEFAULT 'Online',
  delivery_method TEXT DEFAULT 'Email within 24 hours',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  order_status order_status DEFAULT 'pending',
  delivery_status TEXT DEFAULT 'pending',
  proof_upload_url TEXT,
  btc_address TEXT,
  btc_amount TEXT,
  stripe_session_id TEXT,
  delivery_info TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ticket requests table
CREATE TABLE public.ticket_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  trip_type TEXT DEFAULT 'round-trip',
  passengers INTEGER DEFAULT 1,
  cabin_class TEXT DEFAULT 'economy',
  flexibility TEXT,
  preferred_airline TEXT,
  budget DECIMAL(10,2),
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  special_notes TEXT,
  status ticket_request_status DEFAULT 'submitted',
  quoted_price DECIMAL(10,2),
  payment_status payment_status DEFAULT 'pending',
  payment_method payment_method,
  stripe_session_id TEXT,
  btc_address TEXT,
  btc_amount TEXT,
  proof_upload_url TEXT,
  admin_notes TEXT,
  issued_ticket_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table for order/request communication
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  ticket_request_id UUID REFERENCES public.ticket_requests(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin BOOLEAN DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Testimonials table
CREATE TABLE public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  content TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Site settings table
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Vouchers policies
CREATE POLICY "Anyone can view available vouchers" ON public.vouchers FOR SELECT USING (status = 'available' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage vouchers" ON public.vouchers FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Orders policies
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage orders" ON public.orders FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Ticket requests policies
CREATE POLICY "Users can view own requests" ON public.ticket_requests FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create requests" ON public.ticket_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pending requests" ON public.ticket_requests FOR UPDATE USING (auth.uid() = user_id AND status = 'submitted');
CREATE POLICY "Admins can manage requests" ON public.ticket_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Messages policies
CREATE POLICY "Users can view messages for their orders/requests" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.ticket_requests WHERE id = ticket_request_id AND user_id = auth.uid()) OR
  public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Testimonials policies
CREATE POLICY "Anyone can view active testimonials" ON public.testimonials FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage testimonials" ON public.testimonials FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Site settings policies
CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.site_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_vouchers_updated_at BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ticket_requests_updated_at BEFORE UPDATE ON public.ticket_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Insert sample testimonials
INSERT INTO public.testimonials (name, location, content, rating) VALUES
('Marcus J.', 'New York, USA', 'Saved $800 on my business class flight to Tokyo. The voucher was verified and worked perfectly!', 5),
('Sarah L.', 'London, UK', 'Professional service from start to finish. Got my ticket confirmed within 48 hours.', 5),
('David K.', 'Sydney, Australia', 'Was skeptical at first but the team guided me through every step. Highly recommend!', 5);

-- Insert sample vouchers
INSERT INTO public.vouchers (airline, title, type, face_value, currency, expiry_date, discount_percent, sale_price, redemption_notes, terms, verification_method, is_refundable, is_transferable, redemption_method) VALUES
('Delta Air Lines', 'Delta eCredit Voucher', 'voucher', 500.00, 'USD', '2025-12-31', 25, 375.00, 'Apply code at checkout on delta.com', 'Valid for new bookings only. Cannot be combined with other offers.', 'Balance verified via Delta customer service', false, true, 'Online at delta.com'),
('American Airlines', 'AA Flight Credit', 'certificate', 750.00, 'USD', '2025-06-30', 30, 525.00, 'Call AA reservations with voucher code', 'Applicable to base fare only. Taxes paid separately.', 'Verified through AA voucher lookup', true, true, 'Phone reservation'),
('United Airlines', 'United Travel Bank', 'voucher', 1000.00, 'USD', '2025-09-15', 20, 800.00, 'Login to united.com and apply credit', 'Full balance must be used in single booking.', 'Screenshot of travel bank balance', false, false, 'Online at united.com'),
('Southwest Airlines', 'Southwest LUV Voucher', 'gift_card', 300.00, 'USD', '2026-03-01', 15, 255.00, 'Enter code at southwest.com checkout', 'No blackout dates. Funds never expire.', 'Balance check via Southwest website', false, true, 'Online at southwest.com'),
('British Airways', 'BA Travel Voucher', 'voucher', 600.00, 'GBP', '2025-08-20', 28, 432.00, 'Apply during booking on ba.com', 'Valid for flights departing from UK only.', 'Verified via BA customer service', true, true, 'Online at ba.com'),
('Emirates', 'Emirates Flight Credit', 'certificate', 2000.00, 'USD', '2025-11-30', 22, 1560.00, 'Contact Emirates booking center', 'Business and First Class eligible.', 'Email confirmation from Emirates', true, true, 'Phone/Email'),
('Lufthansa', 'Miles & More Voucher', 'voucher', 400.00, 'EUR', '2025-07-15', 18, 328.00, 'Redeem via Lufthansa booking portal', 'Combinable with Miles & More miles.', 'Balance verified via M&M portal', false, true, 'Online'),
('JetBlue', 'JetBlue Travel Credit', 'voucher', 450.00, 'USD', '2025-10-01', 20, 360.00, 'Apply code during jetblue.com checkout', 'Valid for all routes. Mosaic members get priority.', 'Verified via JetBlue chat support', false, true, 'Online at jetblue.com'),
('Qatar Airways', 'QR Travel Voucher', 'certificate', 1500.00, 'USD', '2025-12-15', 25, 1125.00, 'Book via qatarairways.com with code', 'Premium cabin bookings only.', 'Verified through Qatar Airways', true, true, 'Online/Phone'),
('Singapore Airlines', 'SIA Credit Voucher', 'voucher', 800.00, 'USD', '2026-01-31', 20, 640.00, 'Apply at singaporeair.com checkout', 'Valid for SQ operated flights.', 'Email verification from SIA', false, true, 'Online');

-- Insert default site settings
INSERT INTO public.site_settings (key, value) VALUES
('btc_address', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'),
('btc_rate', '43500'),
('site_name', 'Your Travel Agent');