-- Add customer_id to ai_conversations for unified customer tracking
ALTER TABLE public.ai_conversations 
ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.profiles(id);

-- Create index for fast customer history lookups
CREATE INDEX IF NOT EXISTS idx_ai_conversations_customer_id 
ON public.ai_conversations(customer_id);

-- Update existing conversations: link by user_id if present
UPDATE public.ai_conversations
SET customer_id = user_id
WHERE user_id IS NOT NULL AND customer_id IS NULL;

-- Update existing conversations: link by phone if present
UPDATE public.ai_conversations ac
SET customer_id = p.id
FROM public.profiles p
WHERE ac.customer_phone IS NOT NULL 
  AND p.phone IS NOT NULL
  AND ac.customer_phone = p.phone
  AND ac.customer_id IS NULL;

-- Create a view for unified customer history
CREATE OR REPLACE VIEW public.customer_conversation_history AS
SELECT 
  p.id as customer_id,
  p.full_name,
  p.email,
  p.phone,
  ac.id as conversation_id,
  ac.session_id,
  ac.created_at as conversation_started,
  ac.updated_at as last_activity,
  (
    SELECT json_agg(json_build_object(
      'role', m.role,
      'content', m.content,
      'created_at', m.created_at
    ) ORDER BY m.created_at ASC)
    FROM public.ai_chat_messages m 
    WHERE m.conversation_id = ac.id
  ) as messages
FROM public.profiles p
JOIN public.ai_conversations ac ON ac.customer_id = p.id
ORDER BY ac.updated_at DESC;

-- Grant access to the view
GRANT SELECT ON public.customer_conversation_history TO authenticated;

-- Function to get or create customer profile by phone
CREATE OR REPLACE FUNCTION public.get_or_create_customer_by_phone(p_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- Normalize phone number (keep only digits)
  p_phone := regexp_replace(p_phone, '\D', '', 'g');
  
  -- Try to find existing profile by phone
  SELECT id INTO v_customer_id
  FROM public.profiles
  WHERE regexp_replace(phone, '\D', '', 'g') = p_phone
  LIMIT 1;
  
  -- If not found, create a new profile
  IF v_customer_id IS NULL THEN
    INSERT INTO public.profiles (id, phone, created_at, updated_at)
    VALUES (gen_random_uuid(), '+' || p_phone, now(), now())
    RETURNING id INTO v_customer_id;
  END IF;
  
  RETURN v_customer_id;
END;
$$;

-- Function to link conversation to customer
CREATE OR REPLACE FUNCTION public.link_conversation_to_customer(
  p_conversation_id uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.ai_conversations
  SET customer_id = p_customer_id, updated_at = now()
  WHERE id = p_conversation_id AND customer_id IS NULL;
END;
$$;

-- Function to get full customer context for Maya
CREATE OR REPLACE FUNCTION public.get_customer_context(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'created_at', p.created_at
    ),
    'conversation_count', (
      SELECT count(*) FROM public.ai_conversations WHERE customer_id = p.id
    ),
    'recent_messages', (
      SELECT jsonb_agg(msg ORDER BY msg->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'role', m.role,
          'content', m.content,
          'created_at', m.created_at,
          'channel', CASE 
            WHEN ac.session_id LIKE 'whatsapp-%' THEN 'whatsapp'
            WHEN ac.session_id LIKE 'el-%' OR ac.session_id LIKE 'elevenlabs-%' THEN 'voice'
            ELSE 'web'
          END
        ) as msg
        FROM public.ai_chat_messages m
        JOIN public.ai_conversations ac ON ac.id = m.conversation_id
        WHERE ac.customer_id = p.id
        ORDER BY m.created_at DESC
        LIMIT 100
      ) recent
    ),
    'ticket_requests', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'route', tr.origin || ' → ' || tr.destination,
        'dates', tr.departure_date || ' - ' || COALESCE(tr.return_date::text, 'one-way'),
        'status', tr.status,
        'quoted_price', tr.quoted_price,
        'created_at', tr.created_at
      ) ORDER BY tr.created_at DESC)
      FROM public.ticket_requests tr
      WHERE tr.contact_email = p.email OR tr.contact_phone = p.phone
      LIMIT 10
    ),
    'orders', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id,
        'amount', o.amount_paid,
        'status', o.order_status,
        'payment_status', o.payment_status,
        'created_at', o.created_at
      ) ORDER BY o.created_at DESC)
      FROM public.orders o
      WHERE o.user_id = p.id OR o.customer_email = p.email
      LIMIT 10
    )
  ) INTO v_result
  FROM public.profiles p
  WHERE p.id = p_customer_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;