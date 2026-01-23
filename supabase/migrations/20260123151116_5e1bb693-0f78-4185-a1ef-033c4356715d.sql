-- Gift Card Inventory
CREATE TABLE public.gift_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  airline TEXT NOT NULL,
  card_identifier TEXT NOT NULL, -- Last 4 digits or nickname for reference
  balance NUMERIC NOT NULL,
  original_balance NUMERIC NOT NULL,
  purchase_price NUMERIC, -- What you paid for it
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'depleted', 'expired')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Sensitive data - encrypted reference only
  card_reference TEXT NOT NULL -- Full card number stored securely
);

-- Enable RLS
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

-- Only admins can manage gift cards
CREATE POLICY "Admins can manage gift cards" ON public.gift_cards
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Points Accounts (Login Credentials/Logs)
CREATE TABLE public.points_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  airline TEXT NOT NULL CHECK (airline IN ('Alaska', 'American', 'United', 'Delta', 'Southwest', 'Other')),
  account_identifier TEXT NOT NULL, -- Username or account nickname
  points_balance INTEGER NOT NULL DEFAULT 0,
  expiry_date DATE, -- When points expire
  purchase_price NUMERIC, -- What you paid for this account
  owner_name TEXT, -- Original owner for reference
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'suspended')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Sensitive login data - encrypted reference
  login_reference TEXT NOT NULL -- Encrypted login credentials
);

-- Enable RLS
ALTER TABLE public.points_accounts ENABLE ROW LEVEL SECURITY;

-- Only admins can manage points accounts
CREATE POLICY "Admins can manage points accounts" ON public.points_accounts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Pricing Rules Configuration
CREATE TABLE public.pricing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name TEXT NOT NULL,
  min_market_price NUMERIC, -- Apply when market price is above this
  max_market_price NUMERIC, -- Apply when market price is below this
  discount_percent NUMERIC NOT NULL DEFAULT 50, -- Discount from market price
  priority INTEGER NOT NULL DEFAULT 1, -- Lower = higher priority
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

-- Admins can manage, Maya can read
CREATE POLICY "Admins can manage pricing rules" ON public.pricing_rules
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active pricing rules" ON public.pricing_rules
  FOR SELECT USING (is_active = true);

-- Quote Logs - Track all automated quotes for audit
CREATE TABLE public.quote_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT,
  customer_email TEXT,
  customer_name TEXT,
  route TEXT NOT NULL, -- e.g., "LAX to JFK"
  travel_dates TEXT NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  market_price NUMERIC, -- What JustFly/search showed
  quoted_price NUMERIC NOT NULL, -- What Maya quoted
  discount_applied NUMERIC, -- Percentage discount
  payment_method TEXT CHECK (payment_method IN ('gift_card', 'points', 'hybrid', 'declined')),
  gift_card_id UUID REFERENCES public.gift_cards(id),
  points_account_id UUID REFERENCES public.points_accounts(id),
  status TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'accepted', 'declined', 'expired', 'booked')),
  conversation_id TEXT,
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quote_logs ENABLE ROW LEVEL SECURITY;

-- Admins can manage, system can insert
CREATE POLICY "Admins can manage quote logs" ON public.quote_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert quote logs" ON public.quote_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update quote logs" ON public.quote_logs
  FOR UPDATE USING (true);

-- Insert default pricing rules
INSERT INTO public.pricing_rules (rule_name, max_market_price, discount_percent, priority, notes) VALUES
  ('Very Low Price', 300, 30, 1, 'For already low prices, only 30% discount'),
  ('Standard Price', 1000, 50, 2, 'Standard 50% discount - gift card range'),
  ('High Price', NULL, 50, 3, 'High prices - points preferred');

-- Trigger for updated_at
CREATE TRIGGER update_gift_cards_updated_at
  BEFORE UPDATE ON public.gift_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_points_accounts_updated_at
  BEFORE UPDATE ON public.points_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quote_logs_updated_at
  BEFORE UPDATE ON public.quote_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();