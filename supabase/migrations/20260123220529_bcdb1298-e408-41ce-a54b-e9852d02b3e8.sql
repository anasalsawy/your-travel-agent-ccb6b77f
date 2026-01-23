
-- =============================================
-- FIX 1: Recreate customer_conversation_history view without SECURITY DEFINER
-- =============================================
DROP VIEW IF EXISTS public.customer_conversation_history;

CREATE VIEW public.customer_conversation_history AS
SELECT 
  p.id AS customer_id,
  p.full_name,
  p.email,
  p.phone,
  ac.id AS conversation_id,
  ac.session_id,
  ac.created_at AS conversation_started,
  ac.updated_at AS last_activity,
  (
    SELECT json_agg(
      json_build_object('role', m.role, 'content', m.content, 'created_at', m.created_at) 
      ORDER BY m.created_at
    )
    FROM ai_chat_messages m
    WHERE m.conversation_id = ac.id
  ) AS messages
FROM profiles p
JOIN ai_conversations ac ON ac.customer_id = p.id
ORDER BY ac.updated_at DESC;

-- Grant access to the view
GRANT SELECT ON public.customer_conversation_history TO authenticated;
GRANT SELECT ON public.customer_conversation_history TO service_role;

-- =============================================
-- FIX 2: Tighten ai_conversations RLS policies
-- =============================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can view their own session" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can update their session" ON public.ai_conversations;

-- New policy: Allow INSERT only if session_id is provided (non-empty)
-- This prevents completely anonymous spam but allows the chat to work
CREATE POLICY "Users can create conversations with session"
ON public.ai_conversations FOR INSERT
WITH CHECK (session_id IS NOT NULL AND length(session_id) > 10);

-- New policy: Allow SELECT only for own session_id OR authenticated user's conversations OR staff/admin
CREATE POLICY "Users can view own session conversations"
ON public.ai_conversations FOR SELECT
USING (
  -- Match by session_id (for anonymous chat users - we'll validate via edge function)
  (session_id IS NOT NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
  -- OR authenticated user viewing their linked conversations
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  -- OR authenticated user viewing conversations linked to their customer profile
  OR (auth.uid() IS NOT NULL AND customer_id = auth.uid())
  -- OR staff/admin can view all
  OR is_staff_or_admin(auth.uid())
);

-- New policy: Allow UPDATE only for own session_id OR authenticated user
CREATE POLICY "Users can update own session conversations"
ON public.ai_conversations FOR UPDATE
USING (
  -- Match by session_id
  (session_id IS NOT NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id')
  -- OR authenticated user updating their linked conversations
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
  -- OR customer_id match
  OR (auth.uid() IS NOT NULL AND customer_id = auth.uid())
  -- OR staff/admin
  OR is_staff_or_admin(auth.uid())
);

-- =============================================
-- FIX 3: Tighten ai_chat_messages RLS policies  
-- =============================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Anyone can view messages" ON public.ai_chat_messages;

-- New policy: Allow INSERT only for conversations the user can access
CREATE POLICY "Users can insert messages to accessible conversations"
ON public.ai_chat_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ai_conversations ac
    WHERE ac.id = conversation_id
    AND (
      ac.session_id = current_setting('request.headers', true)::json->>'x-session-id'
      OR (auth.uid() IS NOT NULL AND ac.user_id = auth.uid())
      OR (auth.uid() IS NOT NULL AND ac.customer_id = auth.uid())
      OR is_staff_or_admin(auth.uid())
    )
  )
);

-- New policy: Allow SELECT only for messages in accessible conversations
CREATE POLICY "Users can view messages from accessible conversations"
ON public.ai_chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations ac
    WHERE ac.id = conversation_id
    AND (
      ac.session_id = current_setting('request.headers', true)::json->>'x-session-id'
      OR (auth.uid() IS NOT NULL AND ac.user_id = auth.uid())
      OR (auth.uid() IS NOT NULL AND ac.customer_id = auth.uid())
      OR is_staff_or_admin(auth.uid())
    )
  )
);
