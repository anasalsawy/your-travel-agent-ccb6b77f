// Lobe wiring: ALTERNATING
// Strict L/R/L/R cadence. Each lobe emits at most 1 sentence + optional tool
// and CANNOT react to the other's last message — it just adds to the ledger.
// No back-channel reasoning, no "wait, you're wrong" moves. Cheaper than
// dialogue because neither lobe carries the full transcript — each only sees
// the last 2 turns. Test: does forced brevity beat full dialogue for simple
// tasks?
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders, DEFAULT_MODEL, SENSORY_TOOLS, MOTOR_TOOLS,
  llm, safeParse, execTool, sensorySys, motorSys, Turn, Lobe, Mode,
} from "../_shared/lobe-runtime.ts";

async function run(task: string, maxTurns: number, mode: Mode, model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [{ speaker: "system", say: "TASK: " + task }];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };
  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "alternating" });

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false;
  let speaker: Lobe = "sensory";

  while (turn < maxTurns && !done) {
    turn++;
    // Only see the last 2 turns — no full transcript.
    const window = transcript.slice(-2).map((t) => {
      if (t.speaker === "system") return { role: "user", content: t.say };
      const prefix = t.speaker === "sensory" ? "SENSORY" : "MOTOR";
      const toolNote = t.tool ? " [ran " + t.tool.name + "]" : "";
      return { role: "user", content: prefix + ": " + t.say + toolNote };
    });
    const sysBase = speaker === "sensory" ? sensorySys(mode, SENSORY_TOOLS) : motorSys(mode, MOTOR_TOOLS);
    const sys = sysBase + "\n\nALTERNATING mode: one short line only. Do NOT react to the other lobe's message — just do your part of the task. Max ~15 words in 'say'.";
    const raw = await llm(sys, window, model, { max_tokens: 200 });
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 300);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const wantDone = !!msg?.done;

    let toolResult: any = undefined;
    if (toolReq) {
      const allowed = speaker === "sensory" ? SENSORY_TOOLS : MOTOR_TOOLS;
      const r = await execTool(toolReq.name, toolReq.args ?? {}, allowed, mode);
      toolCalls++;
      toolResult = r;
      log({ kind: "tool_executed", speaker, ...r });
    }
    log({ kind: "turn", turn, speaker, say, tool: toolReq, done: wantDone });
    transcript.push({ speaker, say, tool: toolReq, tool_result: toolResult, done: wantDone });
    if (wantDone && speaker === "sensory") { done = true; log({ kind: "task_complete", by: "sensory" }); break; }
    speaker = speaker === "sensory" ? "motor" : "sensory";
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls });
  return { run_id: runId, transcript, ledger, stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "alternating" } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_turns, mode, model } = await req.json();
    if (!task) throw new Error("task is required");
    const result = await run(task, Math.min(max_turns ?? 10, 20), mode === "full" ? "full" : "safe", model || DEFAULT_MODEL);
    return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
