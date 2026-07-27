// Dual-Lobe Agent — production runtime (real LLMs + real tools).
//
// Two lobes ("brains") share a workspace and a strict JSON envelope protocol:
//   • STRATEGIST  = sense / judge / verify. Reads state. Cannot mutate.
//   • EXECUTOR    = act / motor. Mutates state. Cannot self-verify.
// The router enforces which lobe may call which tool. Every step is logged to
// an in-memory ledger returned in the response; callers persist as needed.
//
// Callable from anything — WhatsApp bot, admin UI, another agent, cron:
//   POST /functions/v1/dual-lobe-agent
//   Body: { task: string, max_cycles?: number, mode?: "safe"|"full" }
//
// Real tool surface (curated + safe):
//   Strategist (read-only):
//     - db_read              (SELECT via service role, allowlist tables)
//     - list_tables          (introspect DB)
//     - list_edge_functions  (introspect functions)
//     - http_get             (any URL, GET, 15s timeout)
//     - tool_registry        (return this catalog to the LLM)
//   Executor (mutating):
//     - db_write             (INSERT/UPDATE via service role, allowlist tables)
//     - http_post            (any URL, POST JSON, 30s timeout)
//     - invoke_edge_function (invoke another edge function in this project)
//     - send_notification    (call the send-notification function)
//
// Guarded by ALLOWLIST_TABLES and mode="safe" (default) which disables
// db_write + invoke_edge_function unless mode="full".
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Only tables the dual-lobe agent may touch. Extend deliberately.
const ALLOWLIST_TABLES = new Set([
  "war_room_messages",
  "war_room_tasks",
  "war_room_heartbeats",
  "agent_room_messages",
  "agent_rooms",
  "notification_log",
  "documents",
]);

const STRATEGIST_TOOLS = ["db_read", "list_tables", "list_edge_functions", "http_get", "tool_registry"];
const EXECUTOR_TOOLS = ["db_write", "http_post", "invoke_edge_function", "send_notification"];

// ── LLM call ──────────────────────────────────────────────────────
async function llm(system: string, user: string, model = "google/gemini-2.5-flash"): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_KEY,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
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

      case "list_tables": {
        return { tool, ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
      }

      case "list_edge_functions": {
        // Static snapshot — cheap and adequate for planning
        return { tool, ok: true, result: { note: "curated subset", functions: [
          "duffel-search", "duffel-book-customer-card", "send-notification",
          "chat", "war-room", "azure-agent-run", "foundry-agent-run",
        ] } };
      }

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
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify(body ?? {}),
        });
        const text = await r.text();
        return { tool, ok: r.ok, result: { status: r.status, body: text.slice(0, 4000) } };
      }

      case "send_notification": {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
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
const EXECUTOR_SYS = (mode: string) => `You are the EXECUTOR lobe of a dual-brain agent. You act; you do NOT self-verify. The STRATEGIST lobe reviews everything you propose and grants or blocks permission.

You may only request tools from this allowlist: ${EXECUTOR_TOOLS.join(", ")}.
Runtime mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED.

Emit EXACTLY one JSON object per turn:
{
  "message_type": "action_intent",
  "payload": {
    "goal": "short goal for this step",
    "tool_requested": "<one executor tool>",
    "tool_args": { ... },
    "why": "one sentence rationale"
  }
}
OR
{ "message_type": "done_signal", "payload": { "summary": "..." } }`;

const STRATEGIST_SYS = (mode: string) => `You are the STRATEGIST lobe of a dual-brain agent. You sense, judge, and verify. You NEVER take mutating actions.

Strategist-only tools: ${STRATEGIST_TOOLS.join(", ")}.
Executor tools you may PERMIT: ${EXECUTOR_TOOLS.join(", ")}.
Runtime mode: ${mode}.

Emit EXACTLY one JSON object per turn.
Reviewing an executor intent:
{ "message_type": "permit", "payload": { "decision": "permit"|"revise"|"block", "reason": "...", "allowed_tools": ["<one>"], "next_instruction": "..." } }
Verifying a completed action:
{ "message_type": "verify_result", "payload": { "outcome": "success"|"retry"|"repair"|"rollback", "notes": "..." } }
Declaring task done:
{ "message_type": "task_complete", "payload": { "summary": "..." } }
Optionally sense first:
{ "message_type": "strategist_tool_call", "payload": { "tool": "<strategist tool>", "tool_args": {...} } }`;

// ── Orchestrator ──────────────────────────────────────────────────
async function run(task: string, maxCycles: number, mode: "safe" | "full") {
  const runId = crypto.randomUUID();
  const ledger: any[] = [];
  const workspace: Record<string, any> = { task, mode, observations: [] };
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at: new Date().toISOString(), ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode });

  let lastVerification: any = null;
  let lastActionResult: any = null;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    log({ kind: "cycle_start", cycle });

    // Executor proposes
    const execRaw = await llm(EXECUTOR_SYS(mode), JSON.stringify({
      task, cycle, workspace_summary: workspace,
      last_verification: lastVerification, last_action_result: lastActionResult,
      instruction: "Propose the next single action, or emit done_signal.",
    }));
    const execMsg = safeParse(execRaw);
    log({ kind: "executor_message", message: execMsg });

    // Strategist reviews
    let stratMsg = safeParse(await llm(STRATEGIST_SYS(mode), JSON.stringify({
      task, cycle, workspace_summary: workspace, executor_message: execMsg,
      instruction: "Decide: permit / revise / block. Or task_complete. Optionally sense first.",
    })));
    log({ kind: "strategist_message", message: stratMsg });

    // Strategist may sense first
    if (stratMsg.message_type === "strategist_tool_call") {
      const t = stratMsg.payload?.tool;
      if (!STRATEGIST_TOOLS.includes(t)) {
        log({ kind: "router_reject", reason: "non-strategist tool", tool: t });
      } else {
        const result = await execTool(t, stratMsg.payload?.tool_args ?? {}, "strategist", mode);
        log({ kind: "tool_executed", lobe: "strategist", ...result });
        workspace.observations.push({ from: "strategist", ...result });
        stratMsg = safeParse(await llm(STRATEGIST_SYS(mode), JSON.stringify({
          task, cycle, workspace_summary: workspace, executor_message: execMsg,
          your_previous_tool_result: result,
          instruction: "Now emit permit / verify_result / task_complete.",
        })));
        log({ kind: "strategist_message", message: stratMsg });
      }
    }

    if (stratMsg.message_type === "task_complete") {
      log({ kind: "task_complete", summary: stratMsg.payload });
      break;
    }
    if (execMsg.message_type === "done_signal" && stratMsg.message_type !== "permit") {
      log({ kind: "executor_declared_done", note: "awaiting strategist confirmation" });
      lastVerification = { outcome: "retry", notes: "Executor declared done; strategist must task_complete." };
      continue;
    }

    if (stratMsg.message_type !== "permit" || stratMsg.payload?.decision !== "permit") {
      log({ kind: "action_blocked_or_revised", decision: stratMsg.payload?.decision });
      lastVerification = { outcome: "blocked", notes: stratMsg.payload?.reason };
      lastActionResult = null;
      continue;
    }

    const requestedTool = execMsg.payload?.tool_requested;
    if (!EXECUTOR_TOOLS.includes(requestedTool)) {
      log({ kind: "router_reject", reason: "not an executor tool", tool: requestedTool });
      lastVerification = { outcome: "retry", notes: "Tool ownership violation." };
      continue;
    }
    if (!(stratMsg.payload?.allowed_tools ?? []).includes(requestedTool)) {
      log({ kind: "router_reject", reason: "tool not in permit", tool: requestedTool });
      lastVerification = { outcome: "retry", notes: "Permit did not cover requested tool." };
      continue;
    }

    const toolResult = await execTool(requestedTool, execMsg.payload?.tool_args ?? {}, "executor", mode);
    log({ kind: "tool_executed", lobe: "executor", ...toolResult });
    workspace.observations.push({ from: "executor", ...toolResult });
    lastActionResult = toolResult;

    const verifyMsg = safeParse(await llm(STRATEGIST_SYS(mode), JSON.stringify({
      task, cycle, workspace_summary: workspace,
      action_that_ran: { tool: requestedTool, args: execMsg.payload?.tool_args, result: toolResult },
      instruction: "Emit ONLY a verify_result envelope for the action above.",
    })));
    log({ kind: "strategist_message", message: verifyMsg });
    lastVerification = verifyMsg.payload ?? { outcome: "retry" };
  }

  log({ kind: "run_end" });
  return { run_id: runId, ledger, workspace };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_cycles, mode } = await req.json();
    if (!task) throw new Error("task is required");
    const runMode: "safe" | "full" = mode === "full" ? "full" : "safe";
    const result = await run(task, Math.min(max_cycles ?? 6, 12), runMode);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
