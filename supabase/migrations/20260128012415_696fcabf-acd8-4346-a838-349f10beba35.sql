-- Fix agent_memory_cache to support new memory architecture
-- Drop the overly restrictive check constraint and allow new memory types

ALTER TABLE public.agent_memory_cache 
DROP CONSTRAINT agent_memory_cache_memory_type_check;

-- Add new constraint allowing all memory types needed by the architecture
ALTER TABLE public.agent_memory_cache 
ADD CONSTRAINT agent_memory_cache_memory_type_check 
CHECK (memory_type IN ('short_term', 'long_term', 'global_briefing', 'unified_memory', 'activity_memory', 'holistic_memory'));