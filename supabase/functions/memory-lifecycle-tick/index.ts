// memory-lifecycle-tick — hourly (and heartbeat-driven) memory curator.
//   FILL:       episodic memories accumulate freely up to a cap per agent.
//   FINETUNE:   memories with hit_count >= 3 are promoted into fixed_memories
//               (pinned durable skill), and, once the cap is exceeded, the
//               oldest low-value memories are COMPRESSED into a single
//               distilled lesson before their slots are freed.
//   RETIRE:     never-used memories older than 30 days are retired.
// Idempotent; safe to call any time.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

/** Fill-then-finetune: this is the "fill" ceiling per agent. */
const EPISODIC_CAP = 300;
const COMPRESS_BATCH = 40;

async function distill(chunks: string[]): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      max_tokens: 700,
      messages: [
        { role: "system", content: 'Compress these agent memories into durable, reusable lessons. Drop anything episodic, one-off, or already obvious. Return {"lesson":"..."} — at most 8 short bullet lines inside the string.' },
        { role: "user", content: chunks.join("\n---\n").slice(0, 12000) },
      ],
    }),
  });
  if (!r.ok) throw new Error("distill " + r.status);
  const j = await r.json();
  try { return JSON.parse(j.choices?.[0]?.message?.content ?? "{}").lesson ?? ""; } catch { return ""; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const s = createClient(SB_URL, SR);
  const report: any = { promoted: 0, retired: 0, compressed: 0, freed: 0, errors: [] };

  try {
    // ── FINETUNE (promotion): high-hit episodic → pinned fixed memory ──
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

    // ── RETIRE: stale, never-used ──
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: stale, error: staleErr } = await s.from("episodic_memories")
      .update({ retired_at: new Date().toISOString() })
      .is("retired_at", null).is("last_used_at", null).lt("created_at", cutoff).select("id");
    if (staleErr) report.errors.push(`retire: ${staleErr.message}`);
    else report.retired = stale?.length ?? 0;

    // ── FILL THEN FINETUNE: over the cap, distil the oldest and free the slots ──
    const { data: agents } = await s.from("episodic_memories")
      .select("agent_id").is("retired_at", null).limit(5000);
    const counts = new Map<string, number>();
    for (const a of agents ?? []) counts.set(a.agent_id, (counts.get(a.agent_id) ?? 0) + 1);

    for (const [agentId, count] of counts) {
      if (count <= EPISODIC_CAP) continue;
      const overflow = Math.min(count - EPISODIC_CAP, COMPRESS_BATCH);
      const { data: oldest } = await s.from("episodic_memories")
        .select("id, content").is("retired_at", null).eq("agent_id", agentId)
        .order("hit_count", { ascending: true }).order("created_at", { ascending: true })
        .limit(overflow);
      if (!oldest?.length) continue;
      try {
        const lesson = await distill(oldest.map((o: any) => o.content));
        if (lesson) {
          await s.from("fixed_memories").upsert({
            agent_id: agentId,
            key: `distilled:${new Date().toISOString().slice(0, 10)}`,
            value: lesson, pinned: true,
            source: `compressed ${oldest.length} episodic memories`,
          }, { onConflict: "agent_id,key" });
          report.compressed++;
        }
        await s.from("episodic_memories").delete().in("id", oldest.map((o: any) => o.id));
        report.freed += oldest.length;
      } catch (e: any) {
        report.errors.push(`compress ${agentId}: ${e?.message ?? e}`);
      }
    }
  } catch (e: any) {
    report.errors.push(String(e?.message ?? e));
  }

  return new Response(JSON.stringify({ ok: report.errors.length === 0, ...report }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
