-- ═══════════════════════════════════════════════════════════════════
-- MAYA LEARNING SYSTEM - Tables for AI-driven self-improvement
-- ═══════════════════════════════════════════════════════════════════

-- 1. Conversation reviews - AI coach feedback on each interaction
CREATE TABLE public.maya_conversation_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Link to conversation
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE CASCADE,
  
  -- Outcome tracking
  outcome TEXT CHECK (outcome IN ('booking_completed', 'quote_given', 'payment_received', 'lost_deal', 'follow_up_needed', 'just_browsing', 'unclear')),
  outcome_value NUMERIC,
  
  -- AI Coach analysis
  overall_score INTEGER CHECK (overall_score >= 1 AND overall_score <= 10),
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  suggestions JSONB DEFAULT '[]',
  
  -- Detailed breakdown
  rapport_score INTEGER CHECK (rapport_score >= 1 AND rapport_score <= 10),
  objection_handling_score INTEGER CHECK (objection_handling_score >= 1 AND objection_handling_score <= 10),
  closing_score INTEGER CHECK (closing_score >= 1 AND closing_score <= 10),
  product_knowledge_score INTEGER CHECK (product_knowledge_score >= 1 AND product_knowledge_score <= 10),
  
  -- Key moments
  best_moment TEXT,
  worst_moment TEXT,
  missed_opportunity TEXT,
  
  -- Pattern tags for aggregation
  tags TEXT[] DEFAULT '{}',
  
  -- Customer-specific learnings
  customer_id UUID REFERENCES public.profiles(id),
  customer_preferences_learned JSONB DEFAULT '{}',
  
  -- Metadata
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  transcript_snippet TEXT,
  channel TEXT CHECK (channel IN ('web', 'whatsapp', 'voice'))
);

-- 2. Customer memory - What Maya knows about each customer
CREATE TABLE public.maya_customer_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  
  -- Communication style
  preferred_tone TEXT CHECK (preferred_tone IN ('formal', 'casual', 'direct', 'detailed')),
  response_style TEXT CHECK (response_style IN ('quick_decider', 'needs_time', 'price_focused', 'experience_focused')),
  
  -- Travel preferences
  preferred_airlines TEXT[],
  preferred_cabin_class TEXT,
  typical_destinations TEXT[],
  travel_frequency TEXT CHECK (travel_frequency IN ('frequent', 'occasional', 'rare')),
  budget_range TEXT,
  
  -- Objection patterns
  common_objections TEXT[],
  what_works TEXT[],
  what_failed TEXT[],
  
  -- Relationship
  rapport_level INTEGER CHECK (rapport_level >= 1 AND rapport_level <= 10),
  trust_level INTEGER CHECK (trust_level >= 1 AND trust_level <= 10),
  booking_history_count INTEGER DEFAULT 0,
  total_spend NUMERIC DEFAULT 0,
  
  -- Notes
  key_facts JSONB DEFAULT '[]',
  avoid_topics TEXT[],
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Global learnings - Aggregated patterns across all customers
CREATE TABLE public.maya_global_learnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Learning type
  learning_type TEXT NOT NULL CHECK (learning_type IN ('tactic', 'phrase', 'pattern', 'objection_response', 'closing_technique', 'warning')),
  
  -- The learning itself
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  example TEXT,
  
  -- Effectiveness metrics
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN (success_count + failure_count) > 0 
    THEN (success_count::NUMERIC / (success_count + failure_count)::NUMERIC) * 100 
    ELSE 0 END
  ) STORED,
  
  -- Context
  applies_to TEXT[] DEFAULT '{}',
  avoid_when TEXT[] DEFAULT '{}',
  
  -- Priority
  confidence_score INTEGER CHECK (confidence_score >= 1 AND confidence_score <= 10),
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_validated TIMESTAMP WITH TIME ZONE,
  source TEXT
);

-- 4. Prompt adaptations - Dynamic prompt adjustments
CREATE TABLE public.maya_prompt_adaptations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('global', 'customer', 'channel', 'situation')),
  scope_id TEXT,
  
  -- The adaptation
  adaptation_type TEXT NOT NULL CHECK (adaptation_type IN ('add_instruction', 'remove_instruction', 'modify_tone', 'add_example', 'add_warning')),
  content TEXT NOT NULL,
  priority INTEGER DEFAULT 1,
  
  -- Effectiveness
  times_used INTEGER DEFAULT 0,
  positive_outcomes INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.maya_conversation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_customer_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_global_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maya_prompt_adaptations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff and admins can view reviews" ON public.maya_conversation_reviews
  FOR SELECT USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "System can insert reviews" ON public.maya_conversation_reviews
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage customer memory" ON public.maya_customer_memory
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can upsert customer memory" ON public.maya_customer_memory
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update customer memory" ON public.maya_customer_memory
  FOR UPDATE USING (true);

CREATE POLICY "Admins can manage global learnings" ON public.maya_global_learnings
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert global learnings" ON public.maya_global_learnings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update global learnings" ON public.maya_global_learnings
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can read active learnings" ON public.maya_global_learnings
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage prompt adaptations" ON public.maya_prompt_adaptations
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can manage prompt adaptations" ON public.maya_prompt_adaptations
  FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX idx_reviews_conversation ON public.maya_conversation_reviews(conversation_id);
CREATE INDEX idx_reviews_customer ON public.maya_conversation_reviews(customer_id);
CREATE INDEX idx_reviews_outcome ON public.maya_conversation_reviews(outcome);
CREATE INDEX idx_memory_customer ON public.maya_customer_memory(customer_id);
CREATE INDEX idx_learnings_type ON public.maya_global_learnings(learning_type);
CREATE INDEX idx_learnings_active ON public.maya_global_learnings(is_active);
CREATE INDEX idx_adaptations_scope ON public.maya_prompt_adaptations(scope, scope_id);

-- Trigger for updated_at
CREATE TRIGGER update_maya_customer_memory_updated_at
  BEFORE UPDATE ON public.maya_customer_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();