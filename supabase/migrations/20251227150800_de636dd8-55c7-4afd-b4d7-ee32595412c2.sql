-- Drop the overly permissive public access policy
DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;

-- Create policy that allows only authenticated users to view settings
CREATE POLICY "Authenticated users can view settings" 
ON public.site_settings 
FOR SELECT 
USING (auth.uid() IS NOT NULL);