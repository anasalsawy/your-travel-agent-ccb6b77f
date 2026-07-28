// sensory-scan — bounded exploration of the environment. Callable
// standalone to refresh an agent's cached env brief without a full run.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { agent_id = "dual-lobe-default" } = await req.json().catch(() => ({}));
    const s = createClient(SB_URL, SR);
    const brief: any = { at: new Date().toISOString(), tables: {}, functions: [] };
    const probes = ["war_room_messages", "war_room_tasks", "war_room_heartbeats", "agent_room_messages", "documents", "episodic_memories", "fixed_memories"];
    for (const t of probes) {
      try {
        const { count } = await s.from(t).select("*", { count: "exact", head: true });
        brief.tables[t] = { exists: true, approx_rows: count ?? 0 };
      } catch { brief.tables[t] = { exists: false }; }
    }
    brief.functions = ["duffel-search", "send-notification", "chat", "dual-lobe-agent", "single-lobe-agent", "sensory-scan", "memory-lifecycle-tick"];
    await s.from("env_briefs").upsert({
      agent_id, environment_hash: "v1", brief, generated_at: new Date().toISOString(),
    }, { onConflict: "agent_id,environment_hash" });
    return new Response(JSON.stringify({ ok: true, brief }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
