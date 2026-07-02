
CREATE TABLE public.agent_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room TEXT NOT NULL CHECK (room IN ('builders','shoppers')),
  title TEXT,
  azure_response_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_rooms TO authenticated;
GRANT ALL ON public.agent_rooms TO service_role;
ALTER TABLE public.agent_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read rooms" ON public.agent_rooms FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write rooms" ON public.agent_rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.agent_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.agent_rooms(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.agent_room_messages (room_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_room_messages TO authenticated;
GRANT ALL ON public.agent_room_messages TO service_role;
ALTER TABLE public.agent_room_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read room msgs" ON public.agent_room_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write room msgs" ON public.agent_room_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_rooms;
