// Lobe wiring: REFLEX ARC
// Motor auto-executes low-risk READ tools without asking sensory (the reflex
// arc — spinal cord acts before the brain hears about it). Sensory only
// gets called in on WRITES or REPEATED READ FAILURES. Test: does skipping
// the sensory LLM for reads cut latency without hurting quality?
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  corsHeaders, DEFAULT_MODEL, SENSORY_TOOLS, MOTOR_TOOLS,
  llm, safeParse, execTool, motorSys, sensorySys, buildMessages, isReadOnlyTool,
  Turn, Mode,
} from "../_shared/lobe-runtime.ts";

// Motor gets everything so it can reflex on reads too.
const MOTOR_REFLEX_TOOLS = [...new Set([...MOTOR_TOOLS, ...SENSORY_TOOLS])];

async function run(task: string, maxTurns: number, mode: Mode, model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const transcript: Turn[] = [{ speaker: "system", say: "TASK: " + task }];
  const ledger: any[] = [];
  let seq = 0;
  const log = (e: any) => { ledger.push({ seq: ++seq, at_ms: Date.now() - t0, ...e }); };
  log({ kind: "run_start", run_id: runId, task, mode, model, model_of_thought: "reflex-arc" });

  let llmCalls = 0, toolCalls = 0, turn = 0, done = false, reflexes = 0;

  while (turn < maxTurns && !done) {
    turn++;
    // Motor speaks first. It can reflex on reads or escalate to sensory.
    const motorMessages = buildMessages(transcript, "motor");
    const motorSysStr = motorSys(mode, MOTOR_REFLEX_TOOLS) +
      "\n\nREFLEX ARC: You may fire READ tools (" + SENSORY_TOOLS.join(", ") + ") on your own — no dialogue needed. But for WRITE tools (" + MOTOR_TOOLS.filter((t) => !isReadOnlyTool(t)).join(", ") + "), you MUST set escalate=true and wait for sensory to confirm.\n\nJSON: { \"say\": \"...\", \"tool\": {...} | null, \"escalate\": false, \"done\": false }";
    const raw = await llm(motorSysStr, motorMessages, model);
    llmCalls++;
    const msg = safeParse(raw);
    const say = String(msg?.say ?? "").slice(0, 2000);
    const toolReq = msg?.tool && msg.tool.name ? msg.tool : null;
    const escalate = !!msg?.escalate;
    const wantDone = !!msg?.done;

    // Reflex: read tool → just run it, no sensory consult.
    if (toolReq && isReadOnlyTool(toolReq.name) && !escalate) {
      const r = await execTool(toolReq.name, toolReq.args ?? {}, MOTOR_REFLEX_TOOLS, mode);
      toolCalls++;
      reflexes++;
      log({ kind: "reflex", speaker: "motor", ...r });
      transcript.push({ speaker: "motor", say, tool: toolReq, tool_result: r });
      if (wantDone) { done = true; break; }
      continue;
    }

    // Otherwise → escalate to sensory for approval.
    transcript.push({ speaker: "motor", say, tool: toolReq, done: wantDone });
    log({ kind: "turn", turn, speaker: "motor", say, tool: toolReq, escalated: true });

    if (!toolReq && !wantDone && !escalate) continue;

    const sensoryMessages = buildMessages(transcript, "sensory");
    const sensorySysStr = sensorySys(mode, SENSORY_TOOLS) + "\n\nREFLEX ARC: motor is asking you to approve a WRITE (or asking whether to finish). Emit { \"approve\": true|false, \"say\": \"why\", \"done\": false }.";
    const raw2 = await llm(sensorySysStr, sensoryMessages, model);
    llmCalls++;
    const decision = safeParse(raw2);
    const approve = !!decision?.approve;
    const senSay = String(decision?.say ?? "").slice(0, 1000);
    transcript.push({ speaker: "sensory", say: senSay });
    log({ kind: "sensory_verdict", approve, say: senSay });

    if (wantDone && approve) { done = true; log({ kind: "task_complete", by: "sensory" }); break; }
    if (toolReq && approve) {
      const r = await execTool(toolReq.name, toolReq.args ?? {}, MOTOR_REFLEX_TOOLS, mode);
      toolCalls++;
      log({ kind: "tool_executed", speaker: "motor", approved: true, ...r });
      transcript.push({ speaker: "motor", say: "executed after approval", tool: toolReq, tool_result: r });
    }
  }

  const elapsed = Date.now() - t0;
  log({ kind: "run_end", elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, reflexes });
  return { run_id: runId, transcript, ledger, stats: { elapsed_ms: elapsed, turns: turn, llm_calls: llmCalls, tool_calls: toolCalls, model_of_thought: "reflex-arc", reflexes } as any };
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
