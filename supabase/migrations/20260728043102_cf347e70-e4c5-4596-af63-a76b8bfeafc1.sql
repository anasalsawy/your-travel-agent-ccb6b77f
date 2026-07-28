
CREATE TABLE IF NOT EXISTS public.persistent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  thread_key text NOT NULL,
  last_run_id text,
  rolling_summary text NOT NULL DEFAULT '',
  turn_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, thread_key)
);
GRANT SELECT ON public.persistent_sessions TO authenticated;
GRANT ALL ON public.persistent_sessions TO service_role;
ALTER TABLE public.persistent_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_admin_read" ON public.persistent_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.fixed_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  pinned boolean NOT NULL DEFAULT true,
  hit_count integer NOT NULL DEFAULT 0,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (agent_id, key)
);
GRANT SELECT ON public.fixed_memories TO authenticated;
GRANT ALL ON public.fixed_memories TO service_role;
ALTER TABLE public.fixed_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fixed_mem_admin_read" ON public.fixed_memories FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.episodic_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  hit_count integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  retired_at timestamptz
);
CREATE INDEX IF NOT EXISTS episodic_agent_idx ON public.episodic_memories(agent_id, retired_at NULLS FIRST, created_at DESC);
GRANT SELECT ON public.episodic_memories TO authenticated;
GRANT ALL ON public.episodic_memories TO service_role;
ALTER TABLE public.episodic_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episodic_admin_read" ON public.episodic_memories FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.env_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  environment_hash text NOT NULL,
  brief jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, environment_hash)
);
GRANT SELECT ON public.env_briefs TO authenticated;
GRANT ALL ON public.env_briefs TO service_role;
ALTER TABLE public.env_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "env_briefs_admin_read" ON public.env_briefs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.lobe_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  arm text NOT NULL CHECK (arm IN ('single','dual','dual_plus')),
  addons text[] NOT NULL DEFAULT '{}',
  correct boolean,
  composite_score numeric,
  duration_ms integer,
  llm_calls integer,
  tool_calls integer,
  transcript jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bench_task_idx ON public.lobe_benchmark_runs(task_id, arm, created_at DESC);
GRANT SELECT ON public.lobe_benchmark_runs TO authenticated;
GRANT ALL ON public.lobe_benchmark_runs TO service_role;
ALTER TABLE public.lobe_benchmark_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bench_admin_read" ON public.lobe_benchmark_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
