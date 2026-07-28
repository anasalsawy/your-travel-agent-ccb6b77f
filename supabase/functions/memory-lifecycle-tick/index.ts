// memory-lifecycle-tick — hourly worker.
//   FINETUNE: episodic memories with hit_count >= 3 get promoted into
//             fixed_memories (pinned).
//   RETIRE:   episodic memories older than 30 days AND never used since
//             creation are marked retired_at.
// Idempotent; safe to call any time.
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
  const s = createClient(SB_URL, SR);
  const report: any = { promoted: 0, retired: 0, errors: [] };

  try {
    // Promote high-hit episodic → fixed
    const { data: hot } = await s.from("episodic_memories")
      .select("id, agent_id, content, tags, hit_count")
      .is("retired_at", null).gte("hit_count", 3).limit(50);
    for (const row of hot ?? []) {
      const key = `skill:${(row.tags?.[0] ?? "generic")}:${row.id.slice(0, 8)}`;
      const { error } = await s.from("fixed_memories").upsert({
        agent_id: row.agent_id, key, value: row.content, pinned: true,
        source: `promoted from episodic ${row.id}`,
      }, { onConflict: "agent_id,key" });
      if (error) { report.errors.push(`promote ${row.id}: ${error.message}`); continue; }
      await s.from("episodic_memories").update({ retired_at: new Date().toISOString() }).eq("id", row.id);
      report.promoted++;
    }

    // Retire stale never-used memories
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: stale, error: staleErr } = await s.from("episodic_memories")
      .update({ retired_at: new Date().toISOString() })
      .is("retired_at", null).is("last_used_at", null).lt("created_at", cutoff).select("id");
    if (staleErr) report.errors.push(`retire: ${staleErr.message}`);
    else report.retired = stale?.length ?? 0;
  } catch (e: any) {
    report.errors.push(String(e?.message ?? e));
  }

  return new Response(JSON.stringify({ ok: report.errors.length === 0, ...report }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
