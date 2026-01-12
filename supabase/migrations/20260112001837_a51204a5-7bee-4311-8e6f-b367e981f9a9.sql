-- Add owner_verified column to track boss mode in the database
-- This is needed because edge functions are stateless (in-memory Maps don't persist between requests)
ALTER TABLE public.ai_conversations 
ADD COLUMN owner_verified boolean DEFAULT false;

-- Add index for quick lookup
CREATE INDEX idx_ai_conversations_owner_verified ON public.ai_conversations(owner_verified) WHERE owner_verified = true;