-- Make the proof-uploads bucket private (disable public access)
UPDATE storage.buckets 
SET public = false 
WHERE name = 'proof-uploads';

-- Drop existing storage policies for proof-uploads if any
DROP POLICY IF EXISTS "Users can upload own proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins and owners can view proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own proofs" ON storage.objects;

-- Create RLS policy for uploading proofs (authenticated users can upload to their own folder)
CREATE POLICY "Users can upload own proofs" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'proof-uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy for viewing proofs (admins can view all, users can view their own)
CREATE POLICY "Admins and owners can view proofs" 
ON storage.objects FOR SELECT 
TO authenticated
USING (
  bucket_id = 'proof-uploads' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    public.has_role(auth.uid(), 'admin')
  )
);

-- Create RLS policy for deleting proofs (users can delete their own)
CREATE POLICY "Users can delete own proofs" 
ON storage.objects FOR DELETE 
TO authenticated
USING (
  bucket_id = 'proof-uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);