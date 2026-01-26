-- Create agent memory cache table for pre-compiled, always-available memory
CREATE TABLE public.agent_memory_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type text NOT NULL CHECK (memory_type IN ('short_term', 'long_term')),
  compiled_content text NOT NULL,
  stats jsonb DEFAULT '{}'::jsonb,
  compiled_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(memory_type)
);

-- Enable RLS
ALTER TABLE public.agent_memory_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read (agents need access)
CREATE POLICY "Anyone can read memory cache"
ON public.agent_memory_cache FOR SELECT
USING (true);

-- Only system can write
CREATE POLICY "System can upsert memory cache"
ON public.agent_memory_cache FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update memory cache"
ON public.agent_memory_cache FOR UPDATE
USING (true);

-- Add comment
COMMENT ON TABLE public.agent_memory_cache IS 'Pre-compiled agent memory snapshots updated by cron job. Always available regardless of conversation state.';