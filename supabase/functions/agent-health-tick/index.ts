// AGENT HEALTH WATCHDOG — the organization's immune system.
//
// Agents are not allowed to die. Everything that can silently kill one is
// repaired here, on a schedule, without a human:
//
//   1. Proven pool     — keep at least MIN_PROVEN models that have actually
//                        served. Community fine-tunes that answer 503 forever
//                        are probed out of the way instead of being handed to
//                        an agent.
//   2. Second chances  — a model cooled down long ago gets its record cleared,
//                        so a bad minute is never a life sentence.
//   3. Pins            — an agent pinned to a dead model is put back on "auto".
//   4. Stuck work      — a delegation that has been "running" past the wall
//                        clock is revived (or escalated) instead of hanging.
//   5. Intersection    — abandoned traffic leases are swept so the light can
//                        never jam closed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { provenModels, rankModels, probeModel, hasFeatherless, trafficStatus, resolveAgentModel, routeChatSafe } from "../_shared/model-router.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MIN_PROVEN = 3;
const STUCK_MINUTES = 25;
const MAX_ATTEMPTS = 3;

/**
 * ROLL CALL — ask every active agent to answer for itself, all at once.
 * This is the proof that the whole roster is alive: each agent speaks through
 * its own resolved model, across the shared traffic light, with no exceptions
 * allowed to escape.
 */
async function rollCall() {
  const s = sb();
  const { data: agents } = await s.from("ao_agents")
    .select("agent_key,display_name,department,model").eq("status", "active").order("agent_key");
  const results = await Promise.all((agents ?? []).map(async (a: any) => {
    const model = await resolveAgentModel(a.agent_key, a.model);
    const t0 = Date.now();
    const r = await routeChatSafe({
      messages: [
        { role: "system", content: 'You are ' + a.display_name + ' (' + a.department + '). Answer ONLY as JSON: {"agent":"' + a.agent_key + '","ready":true,"duty":"<your job in six words>"}' },
        { role: "user", content: "Roll call. Report ready." },
      ],
      response_format: { type: "json_object" }, temperature: 0, max_tokens: 120,
    }, model, "rollcall:" + a.agent_key);
    let duty = "";
    try { duty = String(JSON.parse(r.content ?? "{}").duty ?? ""); } catch { /* free text is fine */ }
    return {
      agent: a.agent_key, ready: !r.degraded, degraded: Boolean(r.degraded),
      served_by: r.model, latency_ms: Date.now() - t0, duty: duty.slice(0, 60),
      error: (r as any).error ?? null,
    };
  }));
  return { total: results.length, ready: results.filter((r) => r.ready).length, agents: results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const started = Date.now();
  const s = sb();
  const report: Record<string, unknown> = {};
  const action = await req.json().then((b: any) => b?.action).catch(() => undefined);

  if (action === "roll_call") {
    const rc = await rollCall();
    return json({ ok: true, duration_ms: Date.now() - started, ...rc });
  }

  try {
    // 1. Second chances: clear stale punishment so the pool can refill.
    const halfHourAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: revived } = await s.from("ai_model_health")
      .update({ consecutive_errors: 0, cooldown_until: null })
      .lt("cooldown_until", halfHourAgo).select("model_id");
    report.cooldowns_cleared = revived?.length ?? 0;

    // 2. Proven pool: probe until enough models have earned their place.
    let proven = await provenModels(8);
    const probes: unknown[] = [];
    if (hasFeatherless() && proven.length < MIN_PROVEN) {
      const ranked = (await rankModels(24)).map((r) => r.model_id).filter((m) => !proven.includes(m));
      for (const model of ranked) {
        if (proven.length >= MIN_PROVEN) break;
        const p = await probeModel(model, "watchdog");
        probes.push(p);
        // A probe only proves reachability once; the pool needs a record, so
        // count a live model immediately and let health accumulate naturally.
        if (p.ok) proven = [...proven, model];
        if (probes.length >= 8) break;
      }
    }
    report.probes = probes;
    report.proven = proven.slice(0, 8);

    // 3. Pins: no agent may point at a model that cannot serve.
    const { data: agents } = await s.from("ao_agents").select("agent_key,model,status").eq("status", "active");
    const repinned: string[] = [];
    for (const a of agents ?? []) {
      const m = String(a.model ?? "auto");
      if (m === "auto" || /^(openai|google|anthropic)\//i.test(m)) continue; // other provider: not our quota
      if (proven.includes(m)) continue;
      const { data: h } = await s.from("ai_model_health")
        .select("consecutive_errors,ok_count").eq("provider", "featherless").eq("model_id", m).maybeSingle();
      const dead = !h || (h.ok_count ?? 0) === 0 || (h.consecutive_errors ?? 0) >= 3;
      if (dead) {
        await s.from("ao_agents").update({ model: "auto" }).eq("agent_key", a.agent_key);
        repinned.push(a.agent_key + " ← auto (was " + m + ")");
      }
    }
    report.repinned = repinned;

    // 4. Stuck work: a delegation nobody finished is revived, not abandoned.
    const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
    const { data: stuck } = await s.from("ao_delegations")
      .select("id,to_agent,attempts,status").in("status", ["running", "assigned"]).lt("updated_at", stuckBefore).limit(50);
    let revivedCount = 0, escalated = 0;
    for (const d of stuck ?? []) {
      const attempts = Number(d.attempts ?? 0);
      if (attempts >= MAX_ATTEMPTS) {
        await s.from("ao_delegations").update({ status: "failed", result: { reason: "watchdog_escalated_stuck" } }).eq("id", d.id);
        escalated++;
      } else {
        await s.from("ao_delegations").update({ status: "retry", attempts: attempts + 1 }).eq("id", d.id);
        revivedCount++;
      }
    }
    report.delegations_revived = revivedCount;
    report.delegations_escalated = escalated;

    // 5. Sweep the intersection so a crashed isolate cannot hold a slot.
    try { await s.rpc("ai_traffic_sweep"); } catch { /* older schema: leases expire on their own */ }
    report.traffic = await trafficStatus();

    await s.from("ao_events").insert({
      agent_key: "watchdog", event_type: "health_tick",
      summary: "proven=" + proven.length + " repinned=" + repinned.length + " revived=" + revivedCount,
      detail: report,
    });

    return json({ ok: true, duration_ms: Date.now() - started, ...report });
  } catch (e) {
    // Even the immune system is not allowed to take the body down with it.
    return json({ ok: false, error: (e as Error).message, duration_ms: Date.now() - started, ...report });
  }
});
