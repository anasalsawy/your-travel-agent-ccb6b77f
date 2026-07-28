// Dual-Lobe Agent — production runtime (real LLMs + real tools).
//
// v2 performance model — MUST beat a single agent on latency + throughput:
//   • Parallel lobes            — Strategist SENSE and Executor PLAN run
//                                 concurrently at cycle start (2 LLM calls
//                                 in wall time = 1).
//   • Merged permit+verify      — Strategist emits verify-of-previous AND
//                                 permit-of-next in a single call.
//   • Fast-path                 — Read-only executor tools (http_get) and
//                                 strategist sense tools skip permit review.
//   • Parallel tool execution   — Executor may propose up to 3 independent
//                                 tool calls per turn (`actions[]`), run
//                                 with Promise.all.
//   • Asymmetric models         — Strategist uses fast/cheap flash-lite,
//                                 Executor uses smarter flash. Configurable.
//   • Early-stop                — 3 consecutive no-op cycles ends the run.
//
// Protocol / lobes / safety are unchanged from v1:
//   STRATEGIST = sense/judge/verify (read-only tools)
//   EXECUTOR   = act/motor (mutating tools, gated by ALLOWLIST + mode)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { preflight, postflight, buildAddonPrompt, type AddonFlags, type PreflightBundle } from "../_shared/lobe-addons.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWLIST_TABLES = new Set([
  "war_room_messages", "war_room_tasks", "war_room_heartbeats",
  "agent_room_messages", "agent_rooms", "notification_log", "documents",
]);

const STRATEGIST_TOOLS = ["db_read", "list_tables", "list_edge_functions", "http_get", "tool_registry"];
const EXECUTOR_TOOLS = ["db_write", "http_post", "invoke_edge_function", "send_notification", "http_get"];
// Executor tools that do NOT mutate state → skip strategist permit (fast-path).
const READONLY_EXECUTOR_TOOLS = new Set(["http_get"]);

const DEFAULT_STRATEGIST_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_EXECUTOR_MODEL = "google/gemini-2.5-flash";

// ── LLM call ──────────────────────────────────────────────────────
async function llm(system: string, user: string, model: string): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "{}";
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { message_type: "invalid_json", raw: s.slice(0, 500) }; }
}

// ── Real tool executor ────────────────────────────────────────────
async function execTool(
  tool: string,
  args: Record<string, any>,
  lobe: "strategist" | "executor",
  mode: "safe" | "full",
): Promise<{ tool: string; ok: boolean; result?: any; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    switch (tool) {
      case "tool_registry":
        return { tool, ok: true, result: { strategist: STRATEGIST_TOOLS, executor: EXECUTOR_TOOLS, allowlist_tables: [...ALLOWLIST_TABLES] } };
      case "list_tables":
        return { tool, ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
      case "list_edge_functions":
        return { tool, ok: true, result: { functions: [
          "duffel-search", "duffel-book-customer-card", "send-notification",
          "chat", "war-room", "azure-agent-run", "foundry-agent-run",
        ] } };
      case "db_read": {
        const { table, select = "*", eq, limit = 20 } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error(`table ${table} not in allowlist`);
        let q = supabase.from(table).select(select).limit(Math.min(limit, 100));
        if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        const { data, error } = await q;
        if (error) throw error;
        return { tool, ok: true, result: { rows: data } };
      }
      case "http_get": {
        const { url, headers } = args;
        if (!url || typeof url !== "string") throw new Error("url required");
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
        clearTimeout(t);
        const body = await r.text();
        return { tool, ok: r.ok, result: { status: r.status, body: body.slice(0, 4000) } };
      }
      case "db_write": {
        if (mode !== "full") throw new Error("db_write blocked in safe mode");
        const { table, op = "insert", values, eq } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error(`table ${table} not in allowlist`);
        if (op === "insert") {
          const { data, error } = await supabase.from(table).insert(values).select();
          if (error) throw error;
          return { tool, ok: true, result: { inserted: data } };
        } else if (op === "update") {
          let q = supabase.from(table).update(values);
          if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
          const { data, error } = await q.select();
          if (error) throw error;
          return { tool, ok: true, result: { updated: data } };
        }
        throw new Error(`unknown op ${op}`);
      }
      case "http_post": {
        const { url, headers, body } = args;
        if (!url || typeof url !== "string") throw new Error("url required");
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(headers || {}) },
          body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const respBody = await r.text();
        return { tool, ok: r.ok, result: { status: r.status, body: respBody.slice(0, 4000) } };
      }
      case "invoke_edge_function": {
        if (mode !== "full") throw new Error("invoke_edge_function blocked in safe mode");
        const { name, body } = args;
        if (!name || typeof name !== "string") throw new Error("name required");
        const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(body ?? {}),
        });
        const text = await r.text();
        return { tool, ok: r.ok, result: { status: r.status, body: text.slice(0, 4000) } };
      }
      case "send_notification": {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(args),
        });
        const text = await r.text();
        return { tool, ok: r.ok, result: { status: r.status, body: text.slice(0, 2000) } };
      }
      default:
        throw new Error(`unknown tool ${tool} (lobe=${lobe})`);
    }
  } catch (e: any) {
    return { tool, ok: false, error: e?.message || String(e) };
  }
}

// ── Prompts ───────────────────────────────────────────────────────
// v3: MOTOR-CORTEX model.
// The EXECUTOR is no longer an LLM. It is a pure tool dispatcher — a spinal
// reflex arc. It drains a queue of pre-approved actions with ZERO thinking
// latency. All thought lives in the STRATEGIST, which runs non-stop in a
// pipelined loop, producing the next batch of pre-approved actions while the
// motor cortex is still executing the current batch.
//
// Loop shape:
//   plan_promise = strategist.plan(ctx)                 // think
//   loop:
//     batch = await plan_promise                        // receive plan
//     next_plan_promise = strategist.plan(ctx+batch)    // START thinking N+1
//     results = await Promise.all(dispatch(batch))      // motor executes N
//     ctx.append(batch, results)                        // integrate feedback
//   until strategist emits done=true

const STRATEGIST_PLAN_SYS = (mode: string) => `You are the STRATEGIST lobe of a dual-brain agent. You NEVER stop thinking. The MOTOR cortex NEVER stops executing. While it runs batch N, you are already producing batch N+1 — the two pipelines overlap continuously until the task is done.

Your job every turn: emit the NEXT ready-to-execute batch. Do not wait, do not hedge, do not ask for confirmation. If you are uncertain, emit a small probe batch and keep the pipeline moving — never emit an empty plan while work remains.

Tools the motor cortex can run (executor allowlist): ${EXECUTOR_TOOLS.join(", ")}.
Sense tools you can request for yourself (read-only, run in parallel with the motor batch): ${STRATEGIST_TOOLS.join(", ")}.
Runtime mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED for the motor cortex.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.

Emit EXACTLY one JSON object:
{
  "message_type": "plan",
  "payload": {
    "reasoning": "one short sentence — what this batch achieves",
    "verify_previous": { "outcome": "success"|"retry"|"repair"|"rollback"|"n/a", "notes": "..." },
    "sense_batch": [ { "tool": "<strategist tool>", "args": { ... } } ],
    "motor_batch": [ { "tool": "<executor tool>",   "args": { ... } } ],
    "done": false
  }
}
Or when the task is complete:
{ "message_type": "plan", "payload": { "reasoning": "...", "verify_previous": {...}, "sense_batch": [], "motor_batch": [], "done": true } }

Rules:
- "sense_batch" (max 2) and "motor_batch" (1–5) run IN PARALLEL — they must be independent. Sense is not a prerequisite for motor in the same turn; it feeds YOUR next thought.
- Motor-batch actions must have no ordering or data dependency among themselves; anything sequential goes in a later batch.
- Never propose a tool outside its lobe's allowlist. Never propose an unallowlisted table.
- Motor cortex has NO judgment — only include actions you are certain about right now.
- Keep verify_previous.outcome = "n/a" on the first turn.
- Empty batches are wasted cycles; if you cannot advance yet, emit done=true or a small diagnostic probe.`;

// ── Orchestrator (v4, true non-stop pipeline) ────────────────────
// Timeline per cycle:
//
//   t0 ─ receive plan N (await planPromise)                        [strategist thought done]
//   t0 ─ kick plan N+1 (fire-and-forget)                            [strategist starts thinking again]
//   t0 ─ dispatch sense_batch N + motor_batch N in parallel        [motor starts executing]
//        ⋯ both streams run concurrently ⋯
//   t1 ─ tools done (Promise.all) AND plan N+1 done (planPromise)
//        Whichever finishes later gates the cycle. If motor is
//        faster than strategist we log motor_idle_ms; if strategist
//        is faster we log plan_idle_ms. In steady state both ≈ 0.
async function planNext(ctx: any, mode: string, model: string): Promise<any> {
  const raw = await llm(STRATEGIST_PLAN_SYS(mode), JSON.stringify(ctx), model);
  const msg = safeParse(raw);
  return msg?.payload ?? { reasoning: "invalid", verify_previous: { outcome: "retry" }, sense_batch: [], motor_batch: [], done: false, _raw: msg };
}

async function run(task: string, maxCycles: number, mode: "safe" | "full", models: { strategist: string; executor: string }) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const ledger: any[] = [];
  const workspace: Record<string, any> = { task, mode, recent: [] };
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, models, model_of_thought: "pipelined_nonstop_v4" });

  let llmCalls = 0;
  let toolCalls = 0;
  let cyclesRun = 0;
  let emptyStreak = 0;
  let overlapMs = 0;      // wall-time saved by planning during execution
  let motorIdleMs = 0;    // motor finished but next plan not ready → pipeline stall (strategist bottleneck)
  let planIdleMs = 0;     // plan ready but motor still running (motor bottleneck; fine — we WANT this)
  let motorTotalMs = 0;
  let planTotalMs = 0;

  // Kick off the very first plan. Nothing to overlap with yet.
  let planPromise: Promise<any> = planNext({
    task, cycle: 0, workspace_summary: workspace,
    last_batch: null, last_results: null, last_sense: null,
    instruction: "Emit the FIRST plan batch. Keep it small and concrete — the pipeline starts from here.",
  }, mode, models.strategist);
  llmCalls++;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    cyclesRun = cycle;
    const cycleStart = Date.now();
    log({ kind: "cycle_start", cycle });

    // ── Await the plan for THIS cycle (already inflight from last cycle) ──
    const plan = await planPromise;
    log({ kind: "plan", cycle, plan });

    if (plan?.done) { log({ kind: "task_complete", reasoning: plan.reasoning }); break; }

    const senseBatch: Array<{ tool: string; args: any }> = Array.isArray(plan?.sense_batch) ? plan.sense_batch.slice(0, 2) : [];
    const motorBatch: Array<{ tool: string; args: any }> = Array.isArray(plan?.motor_batch) ? plan.motor_batch.slice(0, 5) : [];

    if (senseBatch.length === 0 && motorBatch.length === 0) {
      emptyStreak++;
      log({ kind: "empty_plan", streak: emptyStreak });
      if (emptyStreak >= 2) { log({ kind: "early_stop", reason: "empty_streak" }); break; }
      planPromise = planNext({
        task, cycle, workspace_summary: workspace,
        instruction: "Previous plan was empty. Emit a concrete batch or done=true.",
      }, mode, models.strategist);
      llmCalls++;
      continue;
    }
    emptyStreak = 0;

    // ── KICK NEXT PLAN IMMEDIATELY — non-stop thinking ──────────
    // Strategist starts producing batch N+1 right now, given the plan just
    // emitted. It will not see the tool results until cycle N+2 — that's the
    // cost of overlap and it's fine: verify_previous handles corrections.
    const planStart = Date.now();
    const nextPlanPromise: Promise<any> = planNext({
      task, cycle: cycle + 1, workspace_summary: workspace,
      inflight_batch: motorBatch,
      inflight_sense: senseBatch,
      instruction: "The motor cortex is executing the previous batch right now. Produce the NEXT batch to run immediately after, or done=true. Do not idle.",
    }, mode, models.strategist);
    llmCalls++;

    // ── DISPATCH ALL TOOLS IN PARALLEL (sense + motor, no gate) ──
    const toolStart = Date.now();
    const runnableSense = senseBatch.filter(a => STRATEGIST_TOOLS.includes(a.tool));
    const runnableMotor = motorBatch.filter(a => EXECUTOR_TOOLS.includes(a.tool));
    const droppedSense = senseBatch.length - runnableSense.length;
    const droppedMotor = motorBatch.length - runnableMotor.length;
    if (droppedSense || droppedMotor) {
      log({ kind: "router_reject", dropped_sense: droppedSense, dropped_motor: droppedMotor });
    }

    const senseP = Promise.all(runnableSense.map(a => execTool(a.tool, a.args ?? {}, "strategist", mode)));
    const motorP = Promise.all(runnableMotor.map(a => execTool(a.tool, a.args ?? {}, "executor", mode)));

    // ── Whichever finishes first tells us where the bottleneck is ──
    let toolsDoneAt = 0, planDoneAt = 0;
    const [senseResults, motorResults] = await Promise.all([
      senseP.then(r => { toolsDoneAt = Date.now(); return r; }),
      motorP.then(r => { toolsDoneAt = Math.max(toolsDoneAt, Date.now()); return r; }),
    ]);
    // Now wait for next plan — this is the pipeline overlap window.
    await nextPlanPromise.then(() => { planDoneAt = Date.now(); });

    const toolElapsed = toolsDoneAt - toolStart;
    const planElapsed = planDoneAt - planStart;
    motorTotalMs += toolElapsed;
    planTotalMs += planElapsed;
    const overlapThisCycle = Math.min(toolElapsed, planElapsed);
    overlapMs += overlapThisCycle;
    if (toolsDoneAt < planDoneAt) motorIdleMs += (planDoneAt - toolsDoneAt);
    else planIdleMs += (toolsDoneAt - planDoneAt);

    toolCalls += senseResults.length + motorResults.length;
    senseResults.forEach((r, i) => log({ kind: "tool_executed", lobe: "strategist", parallel_index: i, ...r }));
    motorResults.forEach((r, i) => log({ kind: "tool_executed", lobe: "executor", parallel_index: i, ...r }));
    log({
      kind: "pipeline_cycle_stats", cycle,
      tool_ms: toolElapsed, plan_ms: planElapsed,
      overlap_ms: overlapThisCycle,
      motor_idle_ms: toolsDoneAt < planDoneAt ? planDoneAt - toolsDoneAt : 0,
      plan_idle_ms: toolsDoneAt >= planDoneAt ? toolsDoneAt - planDoneAt : 0,
      cycle_wall_ms: Date.now() - cycleStart,
    });

    // Hand off next plan to the outer loop.
    planPromise = Promise.resolve(await nextPlanPromise);

    workspace.recent = [
      ...(workspace.recent ?? []),
      { cycle, motor_batch: runnableMotor, motor_results: motorResults, sense_results: senseResults },
    ].slice(-3);
  }

  try { await planPromise; } catch { /* ignore */ }

  const elapsed = Date.now() - t0;
  // Naive "serial baseline": what wall time would have been if we ran plan
  // then tools sequentially every cycle. overlap_ms is the saving.
  const serialBaselineMs = motorTotalMs + planTotalMs;
  log({
    kind: "run_end", elapsed_ms: elapsed, cycles: cyclesRun,
    llm_calls: llmCalls, tool_calls: toolCalls,
    overlap_ms: overlapMs, motor_idle_ms: motorIdleMs, plan_idle_ms: planIdleMs,
    motor_total_ms: motorTotalMs, plan_total_ms: planTotalMs,
    serial_baseline_ms: serialBaselineMs,
    pipeline_efficiency: serialBaselineMs > 0 ? +(overlapMs / serialBaselineMs).toFixed(3) : 0,
  });
  return {
    run_id: runId,
    ledger,
    workspace,
    stats: {
      elapsed_ms: elapsed, cycles: cyclesRun, llm_calls: llmCalls, tool_calls: toolCalls,
      overlap_ms: overlapMs, motor_idle_ms: motorIdleMs, plan_idle_ms: planIdleMs,
      motor_total_ms: motorTotalMs, plan_total_ms: planTotalMs,
      serial_baseline_ms: serialBaselineMs,
      pipeline_efficiency: serialBaselineMs > 0 ? +(overlapMs / serialBaselineMs).toFixed(3) : 0,
      model_of_thought: "pipelined_nonstop_v4",
    },
  };
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_cycles, mode, strategist_model, executor_model } = await req.json();
    if (!task) throw new Error("task is required");
    const runMode: "safe" | "full" = mode === "full" ? "full" : "safe";
    const models = {
      strategist: strategist_model || DEFAULT_STRATEGIST_MODEL,
      executor: executor_model || DEFAULT_EXECUTOR_MODEL, // reserved; motor cortex uses no LLM
    };
    const result = await run(task, Math.min(max_cycles ?? 6, 12), runMode, models);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
