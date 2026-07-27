// Lobe wiring: BANDWIDTH-GATED (corpus callosum budget)
// Full dialogue, but each cross-lobe message is HARD-CAPPED at ~40 tokens.
// The corpus callosum has finite bandwidth — real hemispheres compress
// aggressively. Test: does forced compression sharpen coordination or
// starve it?
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders, DEFAULT_MODEL, SENSORY_TOOLS, MOTOR_TOOLS,
  llm, safeParse, execTool, sensorySys, motorSys, buildMessages, Turn, Lobe, Mode,
} from "../_shared/lobe-runtime.ts";

const BUDGET_TOKENS = 40;
const BUDGET_CHARS = BUDGET_TOKENS * 4; // rough

async function run(task: string, maxTurns: number, mode: Mode, model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [{ speaker: "system", say: "TASK: " + task }];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };
  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "bandwidth-gated", budget_tokens: BUDGET_TOKENS });

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false, truncated = 0;
  let speaker: Lobe = "sensory";

  while (turn < maxTurns && !done) {
    turn++;
    const messages = buildMessages(transcript, speaker);
    const sysBase = speaker === "sensory" ? sensorySys(mode, SENSORY_TOOLS) : motorSys(mode, MOTOR_TOOLS);
    const sys = sysBase + "\n\nCORPUS-CALLOSUM BUDGET: your 'say' field must be ≤ " + BUDGET_TOKENS + " tokens (~" + BUDGET_CHARS + " chars). Compress aggressively. Use terse notation, symbols, IDs — full sentences are wasteful. The tool call itself has no budget.";
    const raw = await llm(sys, messages, model, { max_tokens: 400 });
    llmCalls++;
    const msg = safeParse(raw);
    let say = String(msg?.say ?? "");
    if (say.length > BUDGET_CHARS) { say = say.slice(0, BUDGET_CHARS); truncated++; }
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
    log({ kind: "turn", turn, speaker, say, chars: say.length, tool: toolReq, done: wantDone });
    transcript.push({ speaker, say, tool: toolReq, tool_result: toolResult, done: wantDone });
    if (wantDone && speaker === "sensory") { done = true; log({ kind: "task_complete", by: "sensory" }); break; }
    speaker = speaker === "sensory" ? "motor" : "sensory";
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, truncated });
  return { run_id: runId, transcript, ledger, stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "bandwidth-gated", truncated } as any };
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
