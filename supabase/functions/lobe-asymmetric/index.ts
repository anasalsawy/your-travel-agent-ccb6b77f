// Lobe wiring: ASYMMETRIC
// Two lobes, dialogue-style, but with DIFFERENT models per lobe.
//   sensory_model = big/smart (default gpt-5.5) → the eyes get quality
//   motor_model   = small/fast (default gemini-flash-lite) → cheap hands
// Flip them for "motor-heavy" (careful hands, cheap eyes) — good for
// booking/payment flows where the action matters more than the reasoning.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders, SENSORY_TOOLS, MOTOR_TOOLS,
  llm, safeParse, execTool, sensorySys, motorSys, buildMessages, Turn, Lobe, Mode,
} from "../_shared/lobe-runtime.ts";

async function run(task: string, maxTurns: number, mode: Mode, sensoryModel: string, motorModel: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [{ speaker: "system", say: "TASK: " + task }];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };
  log({ kind: "run_start", run_id: runId, task, mode, sensory_model: sensoryModel, motor_model: motorModel, model_of_thought: "asymmetric" });

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false;
  let speaker: Lobe = "sensory";

  while (turn < maxTurns && !done) {
    turn++;
    const messages = buildMessages(transcript, speaker);
    const sys = speaker === "sensory" ? sensorySys(mode, SENSORY_TOOLS) : motorSys(mode, MOTOR_TOOLS);
    const model = speaker === "sensory" ? sensoryModel : motorModel;
    const raw = await llm(sys, messages, model);
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 2000);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const wantDone = !!msg?.done;

    let toolResult: any = undefined;
    if (toolReq) {
      const allowed = speaker === "sensory" ? SENSORY_TOOLS : MOTOR_TOOLS;
      const r = await execTool(toolReq.name, toolReq.args ?? {}, allowed, mode);
      toolCalls++;
      toolResult = r;
      log({ kind: "tool_executed", speaker, model, ...r });
    }
    log({ kind: "turn", turn, speaker, model, say, tool: toolReq, done: wantDone });
    transcript.push({ speaker, say, tool: toolReq, tool_result: toolResult, done: wantDone });
    if (wantDone && speaker === "sensory") { done = true; log({ kind: "task_complete", by: "sensory" }); break; }
    speaker = speaker === "sensory" ? "motor" : "sensory";
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls });
  return { run_id: runId, transcript, ledger, stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "asymmetric" } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_turns, mode, sensory_model, motor_model, profile } = await req.json();
    if (!task) throw new Error("task is required");
    // Profiles for quick presets from the bench.
    const preset: Record<string, [string, string]> = {
      "sensory-heavy": ["openai/gpt-5.5", "google/gemini-2.5-flash-lite"],
      "motor-heavy":   ["google/gemini-2.5-flash-lite", "openai/gpt-5.5"],
      "balanced":      ["google/gemini-2.5-flash", "google/gemini-2.5-flash"],
    };
    let s = sensory_model, m = motor_model;
    if (profile && preset[profile]) { [s, m] = preset[profile]; }
    if (!s) s = "openai/gpt-5.5";
    if (!m) m = "google/gemini-2.5-flash-lite";
    const result = await run(task, Math.min(max_turns ?? 10, 20), mode === "full" ? "full" : "safe", s, m);
    return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
