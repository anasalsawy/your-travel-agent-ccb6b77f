
-- ============ sellers: hide admin_notes & telegram_chat_id from public ============
DROP POLICY IF EXISTS "Approved sellers are publicly visible" ON public.sellers;

CREATE OR REPLACE VIEW public.sellers_public AS
SELECT id, business_name, description, logo_url, website, created_at
FROM public.sellers
WHERE status = 'approved';

GRANT SELECT ON public.sellers_public TO anon, authenticated;

-- ============ ai_conversations: lock down public access ============
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can view their own session" ON public.ai_conversations;
DROP POLICY IF EXISTS "Anyone can update their session" ON public.ai_conversations;

REVOKE ALL ON public.ai_conversations FROM anon;
GRANT SELECT, UPDATE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

CREATE POLICY "Users view own conversations"
ON public.ai_conversations FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own conversations"
ON public.ai_conversations FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ agent_memory_cache: service-role / admin only ============
DROP POLICY IF EXISTS "Anyone can read agent memory cache" ON public.agent_memory_cache;
DROP POLICY IF EXISTS "Anyone can insert agent memory cache" ON public.agent_memory_cache;
DROP POLICY IF EXISTS "Anyone can update agent memory cache" ON public.agent_memory_cache;
DROP POLICY IF EXISTS "Public read agent_memory_cache" ON public.agent_memory_cache;

REVOKE ALL ON public.agent_memory_cache FROM anon, authenticated;
GRANT ALL ON public.agent_memory_cache TO service_role;
GRANT SELECT ON public.agent_memory_cache TO authenticated;

CREATE POLICY "Admins read agent memory cache"
ON public.agent_memory_cache FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============ admin_alerts: only service role can insert ============
DROP POLICY IF EXISTS "Anyone can insert admin alerts" ON public.admin_alerts;
DROP POLICY IF EXISTS "System can insert admin alerts" ON public.admin_alerts;
REVOKE INSERT ON public.admin_alerts FROM anon, authenticated;
GRANT ALL ON public.admin_alerts TO service_role;

-- ============ maya_prompt_adaptations: service role only ============
DROP POLICY IF EXISTS "System can manage prompt adaptations" ON public.maya_prompt_adaptations;
REVOKE INSERT, UPDATE, DELETE ON public.maya_prompt_adaptations FROM anon, authenticated;
GRANT ALL ON public.maya_prompt_adaptations TO service_role;

-- ============ booking_queue: service role writes only ============
DROP POLICY IF EXISTS "Anyone can insert booking queue" ON public.booking_queue;
DROP POLICY IF EXISTS "Anyone can update booking queue" ON public.booking_queue;
DROP POLICY IF EXISTS "System can insert booking queue" ON public.booking_queue;
DROP POLICY IF EXISTS "System can update booking queue" ON public.booking_queue;
REVOKE INSERT, UPDATE ON public.booking_queue FROM anon, authenticated;
GRANT ALL ON public.booking_queue TO service_role;

-- ============ call_logs: service role writes only ============
DROP POLICY IF EXISTS "System can insert call logs" ON public.call_logs;
DROP POLICY IF EXISTS "System can update call logs" ON public.call_logs;
REVOKE INSERT, UPDATE ON public.call_logs FROM anon, authenticated;
GRANT ALL ON public.call_logs TO service_role;

-- ============ maya_customer_memory: service role writes only ============
DROP POLICY IF EXISTS "Anyone can insert customer memory" ON public.maya_customer_memory;
DROP POLICY IF EXISTS "Anyone can update customer memory" ON public.maya_customer_memory;
DROP POLICY IF EXISTS "System can manage customer memory" ON public.maya_customer_memory;
REVOKE INSERT, UPDATE, DELETE ON public.maya_customer_memory FROM anon, authenticated;
GRANT ALL ON public.maya_customer_memory TO service_role;

-- ============ quote_logs: service role / admin writes ============
DROP POLICY IF EXISTS "Anyone can insert quote logs" ON public.quote_logs;
DROP POLICY IF EXISTS "Anyone can update quote logs" ON public.quote_logs;
DROP POLICY IF EXISTS "System can insert quote logs" ON public.quote_logs;
DROP POLICY IF EXISTS "System can update quote logs" ON public.quote_logs;
REVOKE INSERT, UPDATE ON public.quote_logs FROM anon, authenticated;
GRANT ALL ON public.quote_logs TO service_role;

-- ============ documents & document_chunks: admin/service role writes ============
DROP POLICY IF EXISTS "Anyone can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can update documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can insert document chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Anyone can update document chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "System can manage documents" ON public.documents;
DROP POLICY IF EXISTS "System can manage document chunks" ON public.document_chunks;
REVOKE INSERT, UPDATE, DELETE ON public.documents FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.document_chunks FROM anon, authenticated;
GRANT ALL ON public.documents TO service_role;
GRANT ALL ON public.document_chunks TO service_role;

CREATE POLICY "Admins manage documents"
ON public.documents FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage document chunks"
ON public.document_chunks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ maya_conversation_reviews: service role inserts ============
DROP POLICY IF EXISTS "Anyone can insert reviews" ON public.maya_conversation_reviews;
DROP POLICY IF EXISTS "System can insert reviews" ON public.maya_conversation_reviews;
REVOKE INSERT ON public.maya_conversation_reviews FROM anon, authenticated;
GRANT ALL ON public.maya_conversation_reviews TO service_role;

-- ============ maya_global_learnings: service role writes ============
DROP POLICY IF EXISTS "Anyone can insert global learnings" ON public.maya_global_learnings;
DROP POLICY IF EXISTS "Anyone can update global learnings" ON public.maya_global_learnings;
DROP POLICY IF EXISTS "System can manage global learnings" ON public.maya_global_learnings;
REVOKE INSERT, UPDATE, DELETE ON public.maya_global_learnings FROM anon, authenticated;
GRANT ALL ON public.maya_global_learnings TO service_role;
