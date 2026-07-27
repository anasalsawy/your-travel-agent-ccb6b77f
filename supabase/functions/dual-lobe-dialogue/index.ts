// Dual-Lobe Agent — DIALOGUE model.
//
// Two LLMs share a conversation transcript and talk to each other like two
// hemispheres of a brain. Each lobe SEES what the other said and replies to
// it. There is no orchestrator putting words in their mouths — they take
// turns, and either can call a tool on their turn.
//
// Roles:
//   SENSORY  (Strategist) — has awareness of tools, resources, state.
//                           Read-only tools. Sees the world, reasons, asks
//                           the motor lobe to act, verifies outcomes.
//   MOTOR    (Executor)   — has control of mutating tools.
//                           Acts on requests from sensory, reports back what
//                           happened, asks for guidance when unsure.
//
// Loop: sensory speaks -> motor replies (may act) -> sensory replies
// (may sense) -> ... until sensory says <done>.
//
// Contrast with dual-lobe-agent (motor-cortex model): there the executor is a
// pure dispatcher with no LLM. Here BOTH lobes are LLMs and BOTH speak.
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

const DEFAULT_MODEL = "google/gemini-2.5-flash";

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
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "{}";
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { say: s.slice(0, 500), tool: null, done: false }; }
}

async function execTool(
  tool: string,
  args: Record<string, any>,
  lobe: "sensory" | "motor",
  mode: "safe" | "full",
): Promise<{ tool: string; ok: boolean; result?: any; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    switch (tool) {
      case "tool_registry":
        return { tool, ok: true, result: { sensory: SENSORY_TOOLS, motor: MOTOR_TOOLS, tables: [...ALLOWLIST_TABLES] } };
      case "list_tables":
        return { tool, ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
      case "list_edge_functions":
        return { tool, ok: true, result: { functions: ["duffel-search", "send-notification", "chat", "war-room"] } };
      case "db_read": {
        const { table, select = "*", eq, limit = 20 } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error(`table ${table} not allowlisted`);
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
        if (!ALLOWLIST_TABLES.has(table)) throw new Error(`table ${table} not allowlisted`);
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
        throw new Error(`unknown op ${op}`);
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
        const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "send_notification": {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(args),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 2000) } };
      }
      default:
        throw new Error(`unknown tool ${tool} for ${lobe}`);
    }
  } catch (e: any) {
    return { tool, ok: false, error: e?.message || String(e) };
  }
}

const SENSORY_SYS = (mode: string) => `You are the SENSORY lobe of a two-lobe brain. You are one hemisphere; the MOTOR lobe is the other. You are literally in dialogue with motor — you see its messages, it sees yours. Talk to it directly ("motor, please...", "good — now...", "wait, that's wrong because...").

Your nature: awareness, perception, judgment. You see the world through read-only tools: ${SENSORY_TOOLS.join(", ")}. You do NOT act on the world — that's motor's job.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.
Mode: ${mode}.

Every turn, emit ONE JSON object:
{
  "say": "what you say to motor — natural language, first person, addressed to motor",
  "tool": { "name": "<sensory tool>", "args": {...} } | null,
  "done": false
}
Set done=true only when the whole task is complete. When done, still put a final message in "say" (a summary for the record).

Style: short, direct, collegial. Think out loud briefly. When motor reports back, react: agree, correct, redirect, or move on.`;

const MOTOR_SYS = (mode: string) => `You are the MOTOR lobe of a two-lobe brain. You are one hemisphere; the SENSORY lobe is the other. You are literally in dialogue with sensory — you see its messages, it sees yours. Talk to it directly ("ok, doing that...", "done — got X back", "I can't, because...").

Your nature: action. You control mutating tools: ${MOTOR_TOOLS.join(", ")}. You act on sensory's guidance, report results back, and flag when something is unclear or risky.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.
Mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED — if sensory asks for one, say so and propose a dry-run instead.

Every turn, emit ONE JSON object:
{
  "say": "what you say to sensory — natural language, first person, addressed to sensory",
  "tool": { "name": "<motor tool>", "args": {...} } | null,
  "done": false
}
Only set done=true if sensory has already agreed the task is complete.

Style: short, concrete, hands-on. Report what you did or why you're hesitating.`;

async function run(task: string, maxTurns: number, mode: "safe" | "full", model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Array<{ speaker: "sensory" | "motor" | "system"; say: string; tool?: any; tool_result?: any; done?: boolean }> = [];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "dialogue" });
  transcript.push({ speaker: "system", say: `TASK: ${task}` });

  let llmCalls = 0;
  let toolCalls = 0;
  let turn = 0;
  let speaker: "sensory" | "motor" = "sensory";
  let done = false;

  while (turn < maxTurns && !done) {
    turn++;
    // Build chat history from the other lobe's perspective. To this lobe,
    // its own past lines are "assistant" and the other lobe's lines are "user".
    const messages = transcript
      .filter((t) => t.speaker !== "system" || t === transcript[0])
      .map((t) => {
        if (t.speaker === "system") return { role: "user", content: t.say };
        const isSelf = t.speaker === speaker;
        const prefix = t.speaker === "sensory" ? "SENSORY" : "MOTOR";
        const toolNote = t.tool ? `\n[called ${t.tool.name}] -> ${JSON.stringify(t.tool_result ?? {}).slice(0, 400)}` : "";
        return { role: isSelf ? "assistant" : "user", content: `${prefix}: ${t.say}${toolNote}` };
      });

    const sys = speaker === "sensory" ? SENSORY_SYS(mode) : MOTOR_SYS(mode);
    const raw = await llm(sys, messages, model);
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 2000);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const wantDone = !!msg?.done;

    log({ kind: "turn", turn, speaker, say, tool: toolReq, done: wantDone });

    // Route tool through the correct lobe's allowlist.
    let toolResult: any = undefined;
    if (toolReq) {
      const allowed = speaker === "sensory" ? SENSORY_TOOLS : MOTOR_TOOLS;
      if (!allowed.includes(toolReq.name)) {
        toolResult = { ok: false, error: `tool ${toolReq.name} not in ${speaker} allowlist` };
        log({ kind: "tool_rejected", speaker, tool: toolReq.name, reason: "wrong lobe" });
      } else {
        const r = await execTool(toolReq.name, toolReq.args ?? {}, speaker, mode);
        toolCalls++;
        toolResult = r;
        log({ kind: "tool_executed", speaker, ...r });
      }
    }

    transcript.push({ speaker, say, tool: toolReq, tool_result: toolResult, done: wantDone });

    // Sensory has the authority to end the run.
    if (wantDone && speaker === "sensory") { done = true; log({ kind: "task_complete", by: "sensory" }); break; }

    // Alternate speakers.
    speaker = speaker === "sensory" ? "motor" : "sensory";
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls });
  return {
    run_id: runId,
    transcript,
    ledger,
    stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "dialogue" },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_turns, mode, model } = await req.json();
    if (!task) throw new Error("task is required");
    const runMode: "safe" | "full" = mode === "full" ? "full" : "safe";
    const result = await run(task, Math.min(max_turns ?? 10, 20), runMode, model || DEFAULT_MODEL);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
