
ALTER TABLE public.shopper_profile
  ADD COLUMN IF NOT EXISTS payment_pan text,
  ADD COLUMN IF NOT EXISTS payment_exp text,
  ADD COLUMN IF NOT EXISTS payment_cvv text,
  ADD COLUMN IF NOT EXISTS payment_holder text;
