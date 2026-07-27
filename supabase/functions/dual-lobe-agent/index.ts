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
const EXECUTOR_SYS = (mode: string) => `You are the EXECUTOR lobe of a dual-brain agent. Move fast. Do not self-verify — the STRATEGIST lobe verifies you in parallel.

Executor tools: ${EXECUTOR_TOOLS.join(", ")}.
Runtime mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED.

Emit EXACTLY one JSON object per turn. Prefer parallel actions when they are INDEPENDENT (no ordering / data dep):
{
  "message_type": "action_intent",
  "payload": {
    "goal": "short goal",
    "actions": [
      { "tool": "<one executor tool>", "args": { ... }, "why": "one sentence" }
    ]
  }
}
Or when the task is finished:
{ "message_type": "done_signal", "payload": { "summary": "..." } }

Rules: 1–3 actions max per turn. Only put actions in the same turn if they truly don't depend on each other. Single-action turns are fine and often best.`;

const STRATEGIST_SENSE_SYS = (mode: string) => `You are the STRATEGIST lobe (SENSE phase). You look before you leap. You NEVER mutate state.

Sense tools: ${STRATEGIST_TOOLS.join(", ")}. Runtime mode: ${mode}.

Emit ONE JSON object:
{ "message_type": "sense", "payload": { "tool": "<sense tool>", "tool_args": { ... }, "why": "..." } }
Or if no sensing is useful this cycle:
{ "message_type": "skip", "payload": { "why": "..." } }`;

const STRATEGIST_JUDGE_SYS = (mode: string) => `You are the STRATEGIST lobe (JUDGE phase). In ONE call you both VERIFY the previous action(s) and PERMIT (or block/revise) the next executor intent.

Executor tools you may permit: ${EXECUTOR_TOOLS.join(", ")}. Runtime mode: ${mode}.

Emit ONE JSON object:
{
  "message_type": "judge",
  "payload": {
    "verify": { "outcome": "success"|"retry"|"repair"|"rollback"|"n/a", "notes": "..." },
    "permit": {
      "decision": "permit"|"revise"|"block"|"task_complete",
      "reason": "...",
      "allowed_tools": ["<tool>", "..."],
      "next_instruction": "..."
    }
  }
}
Use decision="task_complete" when the task is finished. Use "block" only for safety violations.`;

// ── Orchestrator (v2, parallel) ──────────────────────────────────
async function run(task: string, maxCycles: number, mode: "safe" | "full", models: { strategist: string; executor: string }) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const ledger: any[] = [];
  const workspace: Record<string, any> = { task, mode, observations: [] };
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, models });

  let lastVerification: any = null;
  let lastActionResult: any = null;
  let noopStreak = 0;
  let cyclesRun = 0;
  let llmCalls = 0;
  let toolCalls = 0;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    cyclesRun = cycle;
    log({ kind: "cycle_start", cycle });

    // ── PHASE 1: SENSE + PLAN in parallel ────────────────────────
    const sharedCtx = JSON.stringify({
      task, cycle, workspace_summary: workspace,
      last_verification: lastVerification, last_action_result: lastActionResult,
    });
    const [senseRaw, planRaw] = await Promise.all([
      llm(STRATEGIST_SENSE_SYS(mode), sharedCtx + "\n\nDecide: sense with one tool OR skip.", models.strategist),
      llm(EXECUTOR_SYS(mode), sharedCtx + "\n\nPropose next action(s) or done_signal.", models.executor),
    ]);
    llmCalls += 2;
    const senseMsg = safeParse(senseRaw);
    const planMsg = safeParse(planRaw);
    log({ kind: "sense_message", message: senseMsg });
    log({ kind: "plan_message", message: planMsg });

    // Execute sense tool in parallel with judge prep — but we need sense result for judge context.
    let senseResult: any = null;
    if (senseMsg.message_type === "sense") {
      const t = senseMsg.payload?.tool;
      if (STRATEGIST_TOOLS.includes(t)) {
        senseResult = await execTool(t, senseMsg.payload?.tool_args ?? {}, "strategist", mode);
        toolCalls++;
        log({ kind: "tool_executed", lobe: "strategist", ...senseResult });
        workspace.observations.push({ from: "strategist", ...senseResult });
      } else {
        log({ kind: "router_reject", reason: "non-strategist sense tool", tool: t });
      }
    }

    // Early terminate: executor says done AND no prior blocked state
    if (planMsg.message_type === "done_signal") {
      log({ kind: "executor_done_signal", summary: planMsg.payload });
      // Ask strategist to confirm in a single JUDGE call
      const judgeRaw = await llm(STRATEGIST_JUDGE_SYS(mode), JSON.stringify({
        task, cycle, workspace_summary: workspace,
        sense_result: senseResult, executor_message: planMsg,
        last_action_result: lastActionResult,
        instruction: "Executor declared done. Verify and either task_complete or block with next_instruction.",
      }), models.strategist);
      llmCalls++;
      const judgeMsg = safeParse(judgeRaw);
      log({ kind: "judge_message", message: judgeMsg });
      if (judgeMsg.payload?.permit?.decision === "task_complete") {
        log({ kind: "task_complete", summary: judgeMsg.payload });
        break;
      }
      lastVerification = { outcome: "retry", notes: judgeMsg.payload?.permit?.reason ?? "not yet complete" };
      noopStreak++;
      if (noopStreak >= 3) { log({ kind: "early_stop", reason: "noop_streak" }); break; }
      continue;
    }

    const actions: Array<{ tool: string; args: any; why?: string }> =
      Array.isArray(planMsg.payload?.actions) ? planMsg.payload.actions.slice(0, 3) : [];

    if (actions.length === 0) {
      log({ kind: "plan_empty" });
      noopStreak++;
      if (noopStreak >= 3) { log({ kind: "early_stop", reason: "noop_streak" }); break; }
      continue;
    }

    // ── PHASE 2: JUDGE (verify prev + permit next) ────────────────
    // Fast-path: if EVERY proposed action is a read-only executor tool, skip judge.
    const allReadonly = actions.every(a => READONLY_EXECUTOR_TOOLS.has(a.tool));
    let permit: any;
    if (allReadonly) {
      permit = { decision: "permit", reason: "fast-path readonly", allowed_tools: actions.map(a => a.tool) };
      log({ kind: "fast_path_permit", tools: permit.allowed_tools });
    } else {
      const judgeRaw = await llm(STRATEGIST_JUDGE_SYS(mode), JSON.stringify({
        task, cycle, workspace_summary: workspace,
        sense_result: senseResult, last_action_result: lastActionResult,
        executor_message: planMsg,
        instruction: "Verify previous action if any, then permit / revise / block / task_complete the proposed actions.",
      }), models.strategist);
      llmCalls++;
      const judgeMsg = safeParse(judgeRaw);
      log({ kind: "judge_message", message: judgeMsg });
      lastVerification = judgeMsg.payload?.verify ?? null;
      permit = judgeMsg.payload?.permit ?? { decision: "block", reason: "no permit emitted" };
      if (permit.decision === "task_complete") {
        log({ kind: "task_complete", summary: permit });
        break;
      }
      if (permit.decision !== "permit") {
        log({ kind: "action_blocked_or_revised", decision: permit.decision, reason: permit.reason });
        lastActionResult = null;
        noopStreak++;
        if (noopStreak >= 3) { log({ kind: "early_stop", reason: "noop_streak" }); break; }
        continue;
      }
    }

    // Filter actions by executor allowlist + permit.allowed_tools
    const allowed = new Set(permit.allowed_tools ?? []);
    const runnable = actions.filter(a => EXECUTOR_TOOLS.includes(a.tool) && (allReadonly || allowed.has(a.tool)));
    if (runnable.length === 0) {
      log({ kind: "router_reject", reason: "no runnable actions after permit filter" });
      lastVerification = { outcome: "retry", notes: "Tool ownership / permit mismatch." };
      noopStreak++;
      if (noopStreak >= 3) { log({ kind: "early_stop", reason: "noop_streak" }); break; }
      continue;
    }

    // ── PHASE 3: PARALLEL tool execution ─────────────────────────
    const results = await Promise.all(runnable.map(a => execTool(a.tool, a.args ?? {}, "executor", mode)));
    toolCalls += results.length;
    for (let i = 0; i < results.length; i++) {
      log({ kind: "tool_executed", lobe: "executor", parallel_index: i, ...results[i] });
      workspace.observations.push({ from: "executor", ...results[i] });
    }
    lastActionResult = results.length === 1 ? results[0] : { batch: results };
    noopStreak = 0; // progress
  }

  log({ kind: "run_end", elapsed_ms: Date.now() - t0, cycles: cyclesRun, llm_calls: llmCalls, tool_calls: toolCalls });
  return {
    run_id: runId,
    ledger,
    workspace,
    stats: { elapsed_ms: Date.now() - t0, cycles: cyclesRun, llm_calls: llmCalls, tool_calls: toolCalls },
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
      executor: executor_model || DEFAULT_EXECUTOR_MODEL,
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
