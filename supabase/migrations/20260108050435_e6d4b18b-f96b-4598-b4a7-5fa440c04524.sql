-- Create function to update timestamps first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for AI chat conversations
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_serious BOOLEAN DEFAULT false,
  needs_admin_attention BOOLEAN DEFAULT false,
  admin_notes TEXT,
  last_discount_requested TEXT,
  status TEXT DEFAULT 'active'
);

-- Create table for chat messages
CREATE TABLE public.ai_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create table for admin alerts (when customer is serious/wants discount)
CREATE TABLE public.admin_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  customer_context TEXT,
  discount_requested TEXT,
  is_read BOOLEAN DEFAULT false,
  admin_response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_conversations
CREATE POLICY "Anyone can create conversations" ON public.ai_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view their own session" ON public.ai_conversations FOR SELECT USING (true);
CREATE POLICY "Anyone can update their session" ON public.ai_conversations FOR UPDATE USING (true);

-- RLS Policies for ai_chat_messages
CREATE POLICY "Anyone can insert messages" ON public.ai_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view messages" ON public.ai_chat_messages FOR SELECT USING (true);

-- RLS Policies for admin_alerts (admin only for viewing/updating)
CREATE POLICY "Admins can view all alerts" ON public.admin_alerts FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update alerts" ON public.admin_alerts FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert alerts" ON public.admin_alerts FOR INSERT WITH CHECK (true);

-- Create indexes
CREATE INDEX idx_ai_conversations_session ON public.ai_conversations(session_id);
CREATE INDEX idx_ai_chat_messages_conversation ON public.ai_chat_messages(conversation_id);
CREATE INDEX idx_admin_alerts_unread ON public.admin_alerts(is_read) WHERE is_read = false;

-- Enable realtime for admin alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;

-- Add updated_at trigger
CREATE TRIGGER update_ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();