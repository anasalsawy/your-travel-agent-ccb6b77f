CREATE TABLE public.ao_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  goal text NOT NULL DEFAULT '',
  participants text[] NOT NULL DEFAULT '{}',
  facilitator text,
  mode text NOT NULL DEFAULT 'safe',
  status text NOT NULL DEFAULT 'open',
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ao_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.ao_rooms(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  role text NOT NULL DEFAULT 'agent',
  content text NOT NULL DEFAULT '',
  mentions text[] NOT NULL DEFAULT '{}',
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  kind text NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ao_room_messages_room_idx ON public.ao_room_messages(room_id, created_at);
CREATE INDEX ao_rooms_updated_idx ON public.ao_rooms(updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ao_room_messages TO authenticated;
GRANT ALL ON public.ao_rooms TO service_role;
GRANT ALL ON public.ao_room_messages TO service_role;

ALTER TABLE public.ao_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ao_room_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage ao_rooms" ON public.ao_rooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage ao_room_messages" ON public.ao_room_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ao_rooms_updated BEFORE UPDATE ON public.ao_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();