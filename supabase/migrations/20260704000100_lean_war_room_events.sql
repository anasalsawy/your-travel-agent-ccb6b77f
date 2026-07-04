-- Lean War Room Orchestrator support.
-- This migration is intentionally additive and safe: it does not change existing
-- table contracts used by the frontend. It only adds indexes that make the new
-- orchestrator's event/task lookups cheaper.

CREATE INDEX IF NOT EXISTS war_room_messages_agent_created_idx
  ON public.war_room_messages(agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS war_room_messages_meta_event_idx
  ON public.war_room_messages((meta->>'event'));

CREATE INDEX IF NOT EXISTS war_room_tasks_assignee_status_idx
  ON public.war_room_tasks(assignee, status, priority, created_at);
