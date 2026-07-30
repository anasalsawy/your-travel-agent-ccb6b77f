// Agency OS — the autonomous orchestrator.
// POST { action: "tick" | "run_mission" | "create_mission" | "manifest" | "seed_demo" }
import {
  corsHeaders, sb, log, event, loadPolicies, stageSpec, PIPELINE,
  runAgentTurn, type AoAgent, type Mission,
} from "../_shared/dialogue-os.ts";
import type { Mode } from "../_shared/lobe-runtime.ts";
import { bus, pool } from "../_shared/bus.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "tick";
    const mode: Mode = body.mode === "full" ? "full" : "safe";

    if (action === "manifest") return json({ ok: true, manifest: await buildManifest() });
    if (action === "create_mission") return json(await createMission(body));
    if (action === "seed_demo") return json(await seedDemo());
    if (action === "run_mission") {
      const r = await runMission(body.mission_id, mode, body.cycles ?? 3);
      await bus.drain();
      return json({ ...r, lane_stats: bus.stats });
    }
    const r = await tick(mode, body.limit ?? 3, body.cycles ?? 2, body.concurrency ?? 3);
    await bus.drain();
    return json({ ...r, lane_stats: bus.stats });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

async function createMission(body: any) {
  const { data, error } = await sb().from("ao_missions").insert({
    title: body.title ?? "Untitled opportunity",
    stage: body.stage ?? "lead",
    priority: body.priority ?? 5,
    source: body.source ?? "manual",
    customer_name: body.customer_name ?? null,
    customer_email: body.customer_email ?? null,
    customer_phone: body.customer_phone ?? null,
    payload: body.payload ?? {},
    expected_value: body.expected_value ?? 0,
    owner_agent: "scout",
  }).select().single();
  if (error) throw error;
  event(data.id, "chief", "mission_created", `Mission opened: ${data.title}`);
  log(data.id, "chief", `Mission opened at stage "${data.stage}". Routing to ${stageSpec(data.stage).owner}.`, { kind: "route" });
  return { ok: true, mission: data };
}

async function seedDemo() {
  const rows = [
    { title: "MIA→CAI family of 4, mid-August, budget $3,200", customer_name: "Nadia Farouk", customer_email: "nadia@example.com", source: "web_form", expected_value: 3200, payload: { origin: "MIA", destination: "CAI", adults: 2, children: 2, depart: "2026-08-14", return: "2026-08-30", budget_usd: 3200 } },
    { title: "Abandoned NYOP bid IAH→DXB $780 — re-engage", customer_name: "Marcus Reid", customer_email: "marcus@example.com", source: "nyop_abandoned", expected_value: 900, payload: { origin: "IAH", destination: "DXB", adults: 1, bid_usd: 780 } },
    { title: "Complaint: schedule change on booked LAX→NRT, customer angry", customer_name: "Ellen Park", customer_email: "ellen@example.com", source: "inbound_email", expected_value: 0, stage: "serve", payload: { pnr: "QK7T2L", issue: "airline moved departure 9h, missed connection", sentiment: "angry" } },
  ];
  const { data, error } = await sb().from("ao_missions").insert(rows.map((r: any) => ({ ...r, stage: r.stage ?? "lead", owner_agent: stageSpec(r.stage ?? "lead").owner }))).select();
  if (error) throw error;
  return { ok: true, created: data?.length ?? 0, missions: data };
}

async function loadAgents(): Promise<Record<string, AoAgent>> {
  const { data } = await sb().from("ao_agents").select("*").eq("status", "active");
  const map: Record<string, AoAgent> = {};
  for (const a of (data ?? []) as AoAgent[]) map[a.agent_key] = a;
  return map;
}

async function runMission(missionId: string, mode: Mode, cycles: number) {
  const agents = await loadAgents();
  const policies = await loadPolicies();
  const trace: unknown[] = [];

  for (let c = 0; c < Math.min(cycles, 8); c++) {
    const { data: m } = await sb().from("ao_missions").select("*").eq("id", missionId).single();
    const mission = m as Mission | null;
    if (!mission) throw new Error("mission_not_found");
    if (mission.status !== "open" || mission.needs_human) {
      trace.push({ cycle: c, halted: mission?.needs_human ? "needs_human" : mission?.status });
      break;
    }
    if (mission.stage === "closed") { trace.push({ cycle: c, halted: "closed" }); break; }

    const spec = stageSpec(mission.stage);
    const agent = agents[mission.owner_agent ?? spec.owner] ?? agents[spec.owner];
    if (!agent) throw new Error("no_agent_for_stage:" + mission.stage);

    const turn = await runAgentTurn(agent, mission, spec.goal, policies, mode);
    trace.push({
      cycle: c, stage: mission.stage, agent: agent.agent_key,
      plan: turn.plan, report: turn.report, tool: turn.action?.name ?? null,
      timings: turn.timings ?? null,
    });

    if (turn.escalate) {
      await sb().from("ao_missions").update({ needs_human: true, escalation_reason: turn.escalate.reason, status: "escalated" }).eq("id", mission.id);
      log(mission.id, "chief", `ESCALATED — ${turn.escalate.reason}`, { kind: "escalation" });
      event(mission.id, agent.agent_key, "escalated", turn.escalate.reason);
      break;
    }

    if (turn.advanceStage) {
      const next = turn.handoff && agents[turn.handoff] ? mission.stage : spec.next;
      const nextOwner = turn.handoff && agents[turn.handoff] ? turn.handoff : stageSpec(spec.next).owner;
      const done = next === "closed";
      await sb().from("ao_missions").update({
        stage: next, owner_agent: nextOwner,
        status: done ? "completed" : "open",
      }).eq("id", mission.id);
      log(mission.id, "chief", `${spec.stage} complete → handing to ${nextOwner} for "${next}".`, { to: nextOwner, kind: "route" });
      event(mission.id, "chief", "stage_advanced", `${spec.stage} → ${next}`);
      if (done) break;
    }
  }
  return { ok: true, mission_id: missionId, trace };
}

// One autonomous heartbeat. Missions are independent units of work, so they are
// advanced CONCURRENTLY under a bounded pool; the dialogue bus batches all of
// their narration off-thread. Wall-clock ≈ slowest mission, not their sum.
async function tick(mode: Mode, limit: number, cycles: number, concurrency: number) {
  const startedAt = Date.now();
  const policies = await loadPolicies();
  const cap = Math.min(limit, policies.tick_budget?.missions_per_tick ?? 5);
  const { data: missions } = await sb().from("ao_missions")
    .select("id,title,stage,priority")
    .eq("status", "open").eq("needs_human", false).neq("stage", "closed")
    .order("priority", { ascending: true }).order("updated_at", { ascending: true })
    .limit(cap);

  const list = missions ?? [];
  const lanes = Math.max(1, Math.min(concurrency, policies.tick_budget?.max_concurrency ?? 4));
  const results = await pool(list, lanes, async (m) => {
    try {
      return await runMission(m.id, mode, cycles);
    } catch (e) {
      return { ok: false, mission_id: m.id, error: (e as Error).message };
    }
  });
  const elapsed_ms = Date.now() - startedAt;
  event(null, "chief", "tick", `Heartbeat advanced ${results.length} mission(s) across ${lanes} lane(s) in ${elapsed_ms}ms.`, { mode, lanes, elapsed_ms });
  return { ok: true, processed: results.length, lanes, elapsed_ms, results };
}

// Portable deployment manifest — everything a different business needs to
// stand this org up on its own stack. Vendor-neutral by construction.
async function buildManifest() {
  const { data: agents } = await sb().from("ao_agents").select("agent_key,display_name,department,charter,strategist_prompt,executor_prompt,tools,addons,autonomy_level,model,sort_order").order("sort_order");
  const { data: policies } = await sb().from("ao_policies").select("policy_key,label,description,value,is_active");
  return {
    spec_version: "agency-os/1.0",
    kind: "AutonomousAgency",
    generated_at: new Date().toISOString(),
    runtime: {
      agent_model: "dual-lobe + brain-7",
      lobes: ["strategist", "executor"],
      brain7_regions: ["thalamus", "amygdala", "prefrontal", "basal_ganglia", "motor", "cerebellum", "hippocampus"],
      model_routing: "featherless-auto (health-ranked, auto-failover)",
      governance: "dialogue-os",
      addon_layers: ["brain7", "persistentSession", "fixedMemory", "sensory", "cerebellum"],
      transport: "http/json",
      concurrency_model: "missions advanced in a bounded parallel pool; dialogue/telemetry on a separate non-blocking bus lane",
      lanes: { execution: "sense→gate→act→patch (critical path)", dialogue: "narration, peer critique, telemetry (never awaited)" },
      required_capabilities: ["llm.chat.json", "kv_or_sql.store", "scheduler.cron", "notify.email_or_sms"],
      vendor_neutral: true,
    },
    pipeline: PIPELINE,
    agents: agents ?? [],
    policies: policies ?? [],
    interfaces: {
      orchestrator: { method: "POST", path: "/functions/v1/agency-os", actions: ["tick", "run_mission", "create_mission", "manifest", "seed_demo"] },
      ingress: { method: "POST", path: "/functions/v1/agency-os", action: "create_mission", note: "Any lead source posts here." },
    },
    portability_notes: [
      "Replace the tool executor to rebind capabilities to a different stack; agent charters stay unchanged.",
      "Any OpenAI-compatible endpoint satisfies llm.chat.json.",
      "The pipeline is data, not code — reorder stages to fit another industry.",
    ],
  };
}
