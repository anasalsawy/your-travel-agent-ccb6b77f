// Lobe wiring: CONTRALATERAL
// Sensory holds MOTOR tools. Motor holds SENSORY tools.
// Hypothesis: forcing every action to route through a lobe that lacks the
// tool means every action requires an explicit request-to-the-other-side,
// which the receiver can veto based on its knowledge of state. Mimics the
// optic chiasm crossover — left brain drives right hand, right brain drives
// left hand. Harder to hallucinate an action, because the lobe with the
// tool never has the context to invent a bad one.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders, DEFAULT_MODEL, SENSORY_TOOLS, MOTOR_TOOLS,
  llm, safeParse, execTool, sensorySys, motorSys, buildMessages, Turn, Lobe, Mode,
} from "../_shared/lobe-runtime.ts";

async function run(task: string, maxTurns: number, mode: Mode, model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [{ speaker: "system", say: "TASK: " + task }];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };
  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "contralateral" });

  // Contralateral: swap the toolsets.
  const sensoryHolds = MOTOR_TOOLS;
  const motorHolds = SENSORY_TOOLS;

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false;
  let speaker: Lobe = "sensory";

  while (turn < maxTurns && !done) {
    turn++;
    const messages = buildMessages(transcript, speaker);
    const sysBase = speaker === "sensory"
      ? sensorySys(mode, sensoryHolds) + "\n\nCONTRALATERAL: you now hold MOTOR tools, but MOTOR holds the read tools. You must ASK motor to read/verify anything before you act. If you fire an action motor hasn't confirmed, you're hallucinating."
      : motorSys(mode, motorHolds) + "\n\nCONTRALATERAL: you now hold SENSORY tools (reads). Sensory holds the mutations. Your job is to look up whatever sensory needs before it acts — and to VETO sensory's plan if the state contradicts it.";
    const raw = await llm(sysBase, messages, model);
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 2000);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const wantDone = !!msg?.done;

    let toolResult: any = undefined;
    if (toolReq) {
      const allowed = speaker === "sensory" ? sensoryHolds : motorHolds;
      const r = await execTool(toolReq.name, toolReq.args ?? {}, allowed, mode);
      toolCalls++;
      toolResult = r;
      log({ kind: "tool_executed", speaker, contralateral: true, ...r });
    }
    log({ kind: "turn", turn, speaker, say, tool: toolReq, done: wantDone });
    transcript.push({ speaker, say, tool: toolReq, tool_result: toolResult, done: wantDone });
    if (wantDone && speaker === "sensory") { done = true; log({ kind: "task_complete", by: "sensory" }); break; }
    speaker = speaker === "sensory" ? "motor" : "sensory";
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls });
  return { run_id: runId, transcript, ledger, stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "contralateral" } };
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
