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

const STRATEGIST_PLAN_SYS = (mode: string) => `You are the STRATEGIST lobe of a dual-brain agent. You do all the thinking. The EXECUTOR is a motor cortex — a pure dispatcher with no reasoning; it will run exactly what you approve, in order, with zero deliberation.

Your job every turn: emit the NEXT batch of pre-approved, ready-to-execute actions. You are thinking one step ahead of the motor cortex — while it runs batch N, you are producing batch N+1. Do not wait, do not hedge, do not ask for confirmation.

Tools the motor cortex can run (executor allowlist): ${EXECUTOR_TOOLS.join(", ")}.
Sense tools you can request for yourself (read-only, run before motor batch): ${STRATEGIST_TOOLS.join(", ")}.
Runtime mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED for the motor cortex.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.

Emit EXACTLY one JSON object:
{
  "message_type": "plan",
  "payload": {
    "reasoning": "one short sentence — what this batch achieves and why now",
    "verify_previous": { "outcome": "success"|"retry"|"repair"|"rollback"|"n/a", "notes": "..." },
    "sense_first": [ { "tool": "<strategist tool>", "args": { ... } } ],
    "motor_batch":  [ { "tool": "<executor tool>",   "args": { ... } } ],
    "done": false
  }
}
Or when the task is complete:
{ "message_type": "plan", "payload": { "reasoning": "...", "verify_previous": {...}, "sense_first": [], "motor_batch": [], "done": true } }

Rules:
- "sense_first" runs BEFORE "motor_batch" in the same turn (max 2 sense actions). Use only when you truly need fresh state for THIS batch.
- "motor_batch" is 1–5 independent actions (no ordering/data dependency between them; they run in parallel). If actions are ordered, put later ones in the next turn.
- Never propose a tool outside its lobe's allowlist. Never propose an unallowlisted table.
- Motor cortex has NO judgment: only include actions you are certain about right now.
- Keep verify_previous.outcome = "n/a" on the first turn.`;

// ── Orchestrator (v3, pipelined motor cortex) ────────────────────
async function planNext(ctx: any, mode: string, model: string): Promise<any> {
  const raw = await llm(STRATEGIST_PLAN_SYS(mode), JSON.stringify(ctx), model);
  const msg = safeParse(raw);
  return msg?.payload ?? { reasoning: "invalid", verify_previous: { outcome: "retry" }, sense_first: [], motor_batch: [], done: false, _raw: msg };
}

async function run(task: string, maxCycles: number, mode: "safe" | "full", models: { strategist: string; executor: string }) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const ledger: any[] = [];
  const workspace: Record<string, any> = { task, mode, recent: [] };
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, models, model_of_thought: "pipelined_motor_cortex" });

  let llmCalls = 0;
  let toolCalls = 0;
  let cyclesRun = 0;
  let emptyStreak = 0;

  // Kick off the very first plan.
  let planPromise: Promise<any> = planNext({
    task, cycle: 0, workspace_summary: workspace,
    last_batch: null, last_results: null, last_sense: null,
    instruction: "Emit the FIRST plan batch.",
  }, mode, models.strategist);
  llmCalls++;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    cyclesRun = cycle;
    log({ kind: "cycle_start", cycle });

    // ── Await current plan (strategist thought) ──────────────────
    const plan = await planPromise;
    log({ kind: "plan", cycle, plan });

    if (plan?.done) { log({ kind: "task_complete", reasoning: plan.reasoning }); break; }

    const senseBatch: Array<{ tool: string; args: any }> = Array.isArray(plan?.sense_first) ? plan.sense_first.slice(0, 2) : [];
    const motorBatch: Array<{ tool: string; args: any }> = Array.isArray(plan?.motor_batch) ? plan.motor_batch.slice(0, 5) : [];

    if (senseBatch.length === 0 && motorBatch.length === 0) {
      emptyStreak++;
      log({ kind: "empty_plan", streak: emptyStreak });
      if (emptyStreak >= 2) { log({ kind: "early_stop", reason: "empty_streak" }); break; }
      // Ask strategist to try again with same ctx.
      planPromise = planNext({
        task, cycle, workspace_summary: workspace,
        last_batch: null, last_results: null, last_sense: null,
        instruction: "Previous plan was empty. Emit a concrete batch or done=true.",
      }, mode, models.strategist);
      llmCalls++;
      continue;
    }
    emptyStreak = 0;

    // ── Sense (blocking, feeds strategist next turn) ─────────────
    let senseResults: any[] = [];
    if (senseBatch.length > 0) {
      const runnable = senseBatch.filter(a => STRATEGIST_TOOLS.includes(a.tool));
      senseResults = await Promise.all(runnable.map(a => execTool(a.tool, a.args ?? {}, "strategist", mode)));
      toolCalls += senseResults.length;
      senseResults.forEach((r, i) => log({ kind: "tool_executed", lobe: "strategist", parallel_index: i, ...r }));
    }

    // ── PIPELINE: start N+1 planning BEFORE motor runs batch N ───
    // Strategist gets the plan it just emitted + sense results as context and
    // begins producing batch N+1 while the motor cortex executes batch N.
    planPromise = planNext({
      task, cycle: cycle + 1, workspace_summary: workspace,
      last_batch_pending: motorBatch,
      last_sense: senseResults,
      instruction: "Motor cortex is executing the previous batch now. Produce the NEXT batch to run immediately after, or done=true.",
    }, mode, models.strategist);
    llmCalls++;

    // ── Motor cortex: pure dispatch, no LLM ──────────────────────
    const runnableMotor = motorBatch.filter(a => EXECUTOR_TOOLS.includes(a.tool));
    if (runnableMotor.length < motorBatch.length) {
      log({ kind: "router_reject", reason: "unknown executor tool(s)", dropped: motorBatch.length - runnableMotor.length });
    }
    const motorResults = runnableMotor.length > 0
      ? await Promise.all(runnableMotor.map(a => execTool(a.tool, a.args ?? {}, "executor", mode)))
      : [];
    toolCalls += motorResults.length;
    motorResults.forEach((r, i) => log({ kind: "tool_executed", lobe: "executor", parallel_index: i, ...r }));

    // Trim workspace to last few observations to keep prompt small & fast.
    workspace.recent = [
      ...(workspace.recent ?? []),
      { cycle, motor_batch: runnableMotor, motor_results: motorResults, sense_results: senseResults },
    ].slice(-3);
  }

  // Drain any in-flight plan so we don't leak an unhandled rejection.
  try { await planPromise; } catch { /* ignore */ }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, cycles: cyclesRun, llm_calls: llmCalls, tool_calls: toolCalls });
  return {
    run_id: runId,
    ledger,
    workspace,
    stats: { elapsed_ms: elapsed, cycles: cyclesRun, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "pipelined_motor_cortex" },
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
