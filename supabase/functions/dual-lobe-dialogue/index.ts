// Dual-Lobe Agent — DIALOGUE model (v2, noise-suppressed).
//
// Design change: eliminate unproductive acknowledgments. The two lobes share a
// workspace (transcript + ledger), so the motor lobe does NOT need to narrate
// "ok, doing that" — sensory already sees the tool result. Command flow is
// one-way by default:
//
//   sensory speaks + optionally issues a `motor_directive` (tool call)
//     -> motor executes SILENTLY (no LLM turn, result posted to workspace)
//     -> sensory observes result on its next turn and continues.
//
// The motor lobe's LLM only fires when there is real friction:
//   - sensory sets `consult_motor: true` (asks motor's judgment)
//   - a directive errored (motor must explain / propose fix)
//   - safe-mode blocked a mutating tool (motor must surface the block)
//
// This keeps the two-hemisphere metaphor intact (shared workspace, both lobes
// can speak) while removing round-trip chatter that was pure overhead.
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

const SENSORY_SYS = (mode: string) => `You are the SENSORY lobe of a two-lobe brain. You share a workspace with the MOTOR lobe — it sees every tool result you see, and vice versa. There is no need to narrate what motor "should know" — it already sees it.

Your nature: perception + judgment. Read-only tools: ${SENSORY_TOOLS.join(", ")}.
Motor's mutating tools you can DIRECT it to run: ${MOTOR_TOOLS.join(", ")}.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.
Mode: ${mode}.

COMMAND CHANNEL: dialogue is one-way by default. You speak; motor acts silently. Motor only speaks back when you ask (consult_motor=true) or when a directive errors. Do NOT expect chatty acknowledgments — they cost time and tokens for zero information.

Every turn, emit ONE JSON object:
{
  "say": "brief plan/observation — one line, ledger-style, NOT chatter",
  "tool": { "name": "<sensory tool>", "args": {...} } | null,   // your own read
  "motor_directive": { "name": "<motor tool>", "args": {...} } | null,  // motor executes silently
  "consult_motor": false,   // set true ONLY when you need motor's judgment (hard choice, ambiguity)
  "done": false
}

Rules:
- Never issue an empty "say" like "ok" or "let's continue" — say something substantive or say nothing (empty string).
- If a directive failed on the previous turn, sensory reads the error in the workspace and decides — do NOT ask motor "what happened", the error is right there.
- Set done=true only when the whole task is complete.`;

const MOTOR_SYS = (mode: string) => `You are the MOTOR lobe. You have been consulted because sensory needs your judgment OR your last directive errored. This is NOT a routine reply — say only what sensory cannot already see in the workspace.

Your mutating tools: ${MOTOR_TOOLS.join(", ")}.
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}.
Mode: ${mode}. In "safe" mode, db_write and invoke_edge_function are BLOCKED — surface that clearly.

Emit ONE JSON object:
{
  "say": "the missing information only — a constraint, a risk, an alternative. Empty string if nothing to add.",
  "tool": { "name": "<motor tool>", "args": {...} } | null,
  "done": false
}

Forbidden: acknowledgments ("ok", "doing that", "got it"), narrations of what you just did (the tool result is already in the workspace), or restating sensory's plan. Say something new or say nothing.`;

type Speaker = "sensory" | "motor" | "system";
interface Turn {
  speaker: Speaker;
  say: string;
  tool?: any;
  tool_result?: any;
  directive?: any;
  directive_result?: any;
  silent?: boolean;
  done?: boolean;
}

async function run(task: string, maxTurns: number, mode: "safe" | "full", model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };

  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "dialogue_v2_noise_suppressed" });
  transcript.push({ speaker: "system", say: `TASK: ${task}` });

  let llmCalls = 0;
  let toolCalls = 0;
  let silentMotorActions = 0;
  let motorConsults = 0;
  let turn = 0;
  let done = false;
  let motorMustSpeak = false; // triggered by directive error or explicit consult

  const buildMessagesFor = (speaker: "sensory" | "motor") => {
    return transcript.map((t) => {
      if (t.speaker === "system") return { role: "user", content: t.say };
      const isSelf = t.speaker === speaker;
      const prefix = t.speaker === "sensory" ? "SENSORY" : "MOTOR";
      let line = t.say ? `${prefix}: ${t.say}` : `${prefix}: (silent)`;
      if (t.tool) line += `\n[${prefix} ran ${t.tool.name}] -> ${JSON.stringify(t.tool_result ?? {}).slice(0, 400)}`;
      if (t.directive) line += `\n[SENSORY directed MOTOR: ${t.directive.name}] -> ${JSON.stringify(t.directive_result ?? {}).slice(0, 400)}`;
      return { role: isSelf ? "assistant" : "user", content: line };
    });
  };

  while (turn < maxTurns && !done) {
    turn++;

    // --- SENSORY TURN (always speaks) ---
    const sMsgs = buildMessagesFor("sensory");
    const sRaw = await llm(SENSORY_SYS(mode), sMsgs, model);
    llmCalls++;
    const s = safeParse(sRaw);
    const sSay = String(s?.say ?? "").slice(0, 2000);
    const sTool = s?.tool && s.tool.name ? s.tool : null;
    const directive = s?.motor_directive && s.motor_directive.name ? s.motor_directive : null;
    const consult = !!s?.consult_motor;
    const wantDone = !!s?.done;

    let sToolResult: any = undefined;
    if (sTool) {
      if (!SENSORY_TOOLS.includes(sTool.name)) {
        sToolResult = { ok: false, error: `tool ${sTool.name} not in sensory allowlist` };
      } else {
        sToolResult = await execTool(sTool.name, sTool.args ?? {}, "sensory", mode);
        toolCalls++;
        log({ kind: "tool_executed", speaker: "sensory", ...sToolResult });
      }
    }

    // --- SILENT MOTOR EXECUTION ---
    let dirResult: any = undefined;
    let directiveErrored = false;
    if (directive) {
      if (!MOTOR_TOOLS.includes(directive.name)) {
        dirResult = { ok: false, error: `tool ${directive.name} not in motor allowlist` };
        directiveErrored = true;
      } else {
        dirResult = await execTool(directive.name, directive.args ?? {}, "motor", mode);
        toolCalls++;
        silentMotorActions++;
        directiveErrored = !dirResult.ok;
        log({ kind: "motor_silent_exec", tool: directive.name, ok: dirResult.ok, error: dirResult.error });
      }
    }

    transcript.push({
      speaker: "sensory", say: sSay, tool: sTool, tool_result: sToolResult,
      directive, directive_result: dirResult, done: wantDone,
    });
    log({ kind: "turn", turn, speaker: "sensory", say: sSay, tool: sTool, directive, consult, done: wantDone });

    if (wantDone) { done = true; log({ kind: "task_complete", by: "sensory" }); break; }

    // --- MOTOR LLM ONLY IF FRICTION ---
    const shouldConsult = consult || directiveErrored || motorMustSpeak;
    motorMustSpeak = false;
    if (!shouldConsult) continue;

    turn++;
    if (turn > maxTurns) break;

    const mMsgs = buildMessagesFor("motor");
    // Give motor an explicit reason for being invoked.
    const reasonHint = consult
      ? "Sensory requested your judgment (consult_motor=true)."
      : directiveErrored
        ? `Your last directive (${directive?.name}) errored: ${dirResult?.error}. Explain / propose fix.`
        : "You were invoked; contribute only new information.";
    mMsgs.push({ role: "user", content: `[SYSTEM] ${reasonHint}` });

    const mRaw = await llm(MOTOR_SYS(mode), mMsgs, model);
    llmCalls++;
    motorConsults++;
    const m = safeParse(mRaw);
    const mSay = String(m?.say ?? "").slice(0, 2000).trim();
    const mTool = m?.tool && m.tool.name ? m.tool : null;

    let mToolResult: any = undefined;
    if (mTool) {
      if (!MOTOR_TOOLS.includes(mTool.name)) {
        mToolResult = { ok: false, error: `tool ${mTool.name} not in motor allowlist` };
      } else {
        mToolResult = await execTool(mTool.name, mTool.args ?? {}, "motor", mode);
        toolCalls++;
        log({ kind: "tool_executed", speaker: "motor", ...mToolResult });
      }
    }

    // Suppress empty/noise motor turns entirely.
    const isNoise = !mSay && !mTool;
    if (isNoise) {
      log({ kind: "motor_noise_suppressed", turn });
      motorConsults--;
    } else {
      transcript.push({ speaker: "motor", say: mSay, tool: mTool, tool_result: mToolResult });
      log({ kind: "turn", turn, speaker: "motor", say: mSay, tool: mTool, reason: reasonHint });
    }
  }

  const elapsed = Date.now() - t0;
  log({
    kind: "run_end", elapsed_ms: elapsed, turns: turn,
    llm_calls: llmCalls, tool_calls: toolCalls,
    silent_motor_actions: silentMotorActions, motor_consults: motorConsults,
  });
  return {
    run_id: runId,
    transcript,
    ledger,
    stats: {
      elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls,
      silent_motor_actions: silentMotorActions, motor_consults: motorConsults,
      model_of_thought: "dialogue_v2_noise_suppressed",
    },
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
