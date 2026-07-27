// Single-Lobe Baseline — one LLM, same tools, same envelope, same loop.
//
// This exists so the dual-lobe architectures can be measured against a fair
// single-agent baseline. Success for the dual-lobe design = beating BOTH
// single-lobe baselines (one per model) on the same task, same mode, same
// tool allowlist.
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

const SENSORY_TOOLS = ["db_read", "list_tables", "list_edge_functions", "http_get", "tool_registry"];
const MOTOR_TOOLS = ["db_write", "http_post", "invoke_edge_function", "send_notification", "http_get"];
const ALL_TOOLS = Array.from(new Set([...SENSORY_TOOLS, ...MOTOR_TOOLS]));
function toolsFor(scope: string) {
  if (scope === "sensory") return SENSORY_TOOLS;
  if (scope === "motor") return MOTOR_TOOLS;
  return ALL_TOOLS;
}

async function llm(system: string, messages: Array<{ role: string; content: string }>, model: string): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });
  if (!r.ok) throw new Error("LLM " + r.status + ": " + (await r.text()).slice(0, 300));
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "{}";
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { say: s.slice(0, 500), tool: null, done: false }; }
}

async function execTool(tool: string, args: Record<string, any>, mode: "safe" | "full") {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    switch (tool) {
      case "tool_registry":
        return { tool, ok: true, result: { tools: ALL_TOOLS, tables: [...ALLOWLIST_TABLES] } };
      case "list_tables":
        return { tool, ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
      case "list_edge_functions":
        return { tool, ok: true, result: { functions: ["duffel-search", "send-notification", "chat", "war-room"] } };
      case "db_read": {
        const { table, select = "*", eq, limit = 20 } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
        let q = supabase.from(table).select(select).limit(Math.min(limit, 100));
        if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        const { data, error } = await q;
        if (error) throw error;
        return { tool, ok: true, result: { rows: data } };
      }
      case "http_get": {
        const { url, headers } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, { headers: headers || {} });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "db_write": {
        if (mode !== "full") throw new Error("db_write blocked in safe mode");
        const { table, op = "insert", values, eq } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
        if (op === "insert") {
          const { data, error } = await supabase.from(table).insert(values).select();
          if (error) throw error;
          return { tool, ok: true, result: { inserted: data } };
        }
        if (op === "update") {
          let q = supabase.from(table).update(values);
          if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
          const { data, error } = await q.select();
          if (error) throw error;
          return { tool, ok: true, result: { updated: data } };
        }
        throw new Error("unknown op " + op);
      }
      case "http_post": {
        const { url, headers, body } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(headers || {}) },
          body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "invoke_edge_function": {
        if (mode !== "full") throw new Error("invoke_edge_function blocked in safe mode");
        const { name, body } = args;
        const r = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "send_notification": {
        const r = await fetch(SUPABASE_URL + "/functions/v1/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(args),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 2000) } };
      }
      default:
        throw new Error("unknown tool " + tool);
    }
  } catch (e: any) {
    return { tool, ok: false, error: e?.message || String(e) };
  }
}

const SYS = (mode: string, scope: string, tools: string[]) => {
  const role =
    scope === "sensory" ? "You are a SENSORY-only agent — awareness and perception. You can only read the world; you cannot act on it."
  : scope === "motor"   ? "You are a MOTOR-only agent — action. You act on the world with the tools you have; you have limited awareness."
  :                       "You are a single autonomous agent with full awareness AND full control — sense with reads, act with writes.";
  return `${role}

Tools available to you: ${tools.join(", ")}.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.
Mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED.

Every turn emit ONE JSON object:
{
  "say": "one-line thought / status",
  "tool": { "name": "<tool>", "args": {...} } | null,
  "done": false
}
Set done=true when the task is fully complete; still include a final "say" summary.
Be direct and efficient. One tool per turn. If a step needs a tool you don't have, say so and set done=true.`;
};

async function run(task: string, maxTurns: number, mode: "safe" | "full", model: string, scope: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const tools = toolsFor(scope);
  const transcript: Array<{ speaker: "agent" | "system"; say: string; tool?: any; tool_result?: any; done?: boolean }> = [];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, model, scope, model_of_thought: "single:" + scope });
  transcript.push({ speaker: "system", say: "TASK: " + task });

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false;

  while (turn < maxTurns && !done) {
    turn++;
    const messages = transcript.map((t) => {
      if (t.speaker === "system") return { role: "user", content: t.say };
      const toolNote = t.tool ? "\n[called " + t.tool.name + "] -> " + JSON.stringify(t.tool_result ?? {}).slice(0, 400) : "";
      return { role: "assistant", content: t.say + toolNote };
    });

    const raw = await llm(SYS(mode, scope, tools), messages, model);
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 2000);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const wantDone = !!msg?.done;
    log({ kind: "turn", turn, say, tool: toolReq, done: wantDone });

    let toolResult: any = undefined;
    if (toolReq) {
      if (!tools.includes(toolReq.name)) {
        toolResult = { ok: false, error: "tool " + toolReq.name + " not in " + scope + " scope" };
        log({ kind: "tool_rejected", tool: toolReq.name, scope });
      } else {
        const r = await execTool(toolReq.name, toolReq.args ?? {}, mode);
        toolCalls++;
        toolResult = r;
        log({ kind: "tool_executed", ...r });
      }
    }

    transcript.push({ speaker: "agent", say, tool: toolReq, tool_result: toolResult, done: wantDone });
    if (wantDone) { done = true; log({ kind: "task_complete" }); break; }
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls });
  return {
    run_id: runId,
    transcript,
    ledger,
    stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "single:" + scope + ":" + model },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_turns, mode, model, scope } = await req.json();
    if (!task) throw new Error("task is required");
    const runMode: "safe" | "full" = mode === "full" ? "full" : "safe";
    const runScope = scope === "sensory" || scope === "motor" ? scope : "all";
    const result = await run(task, Math.min(max_turns ?? 12, 20), runMode, model || "google/gemini-2.5-flash", runScope);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

