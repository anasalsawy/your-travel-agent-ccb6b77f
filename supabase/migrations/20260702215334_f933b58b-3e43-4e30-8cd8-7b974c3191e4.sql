
CREATE TABLE public.war_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assistant',
  content TEXT NOT NULL,
  addressed_to TEXT[] DEFAULT '{}',
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX war_room_messages_created_idx ON public.war_room_messages(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.war_room_messages TO authenticated;
GRANT ALL ON public.war_room_messages TO service_role;
ALTER TABLE public.war_room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage war_room_messages" ON public.war_room_messages FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.war_room_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority INT NOT NULL DEFAULT 3,
  created_by TEXT NOT NULL DEFAULT 'chief-of-staff',
  deadline_at TIMESTAMPTZ,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX war_room_tasks_status_idx ON public.war_room_tasks(status, priority);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.war_room_tasks TO authenticated;
GRANT ALL ON public.war_room_tasks TO service_role;
ALTER TABLE public.war_room_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage war_room_tasks" ON public.war_room_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.war_room_heartbeats (
  agent_name TEXT PRIMARY KEY,
  status_line TEXT,
  current_task_id UUID REFERENCES public.war_room_tasks(id) ON DELETE SET NULL,
  mood TEXT DEFAULT 'ready',
  last_beat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.war_room_heartbeats TO authenticated;
GRANT ALL ON public.war_room_heartbeats TO service_role;
ALTER TABLE public.war_room_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage war_room_heartbeats" ON public.war_room_heartbeats FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.war_room_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER war_room_tasks_touch BEFORE UPDATE ON public.war_room_tasks
  FOR EACH ROW EXECUTE FUNCTION public.war_room_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.war_room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.war_room_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.war_room_heartbeats;
