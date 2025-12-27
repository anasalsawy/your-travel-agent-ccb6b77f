-- Add 'zelle' to the payment_method enum
ALTER TYPE public.payment_method ADD VALUE 'zelle';

-- Add zelle_email to site_settings
INSERT INTO public.site_settings (key, value) 
VALUES ('zelle_email', 'Amalmsaid4@gmail.com')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;