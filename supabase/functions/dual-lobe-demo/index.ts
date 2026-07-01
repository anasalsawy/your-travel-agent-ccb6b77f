/**
 * DUAL-LOBE DEMO ORCHESTRATOR
 *
 * Two real LLM calls per cycle (Strategist + Executor), shared ledger,
 * MOCK tool router — tools announce intent and return synthetic results.
 * No real side effects. See docs/dual-lobe-spec.md.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ── Tool registry (mock) ──────────────────────────────────────────
const EXECUTOR_TOOLS = [
  "browser_action", "form_fill", "click", "submit", "file_write",
  "code_modify", "shell_execute", "api_write", "book", "pay", "deploy_function",
];
const STRATEGIST_TOOLS = [
  "web_research", "memory_search", "risk_classifier", "policy_checker",
  "source_verifier", "test_runner", "plan_critic", "approval_gate",
];

// Mock tool executor — returns plausible synthetic data
function mockToolCall(tool: string, args: any, owner: "executor" | "strategist") {
  const now = new Date().toISOString();
  const base = { tool, owner, args, executed_at: now, mock: true };
  const canned: Record<string, any> = {
    browser_action: { ...base, result: "DOM updated (simulated). Screenshot: ws://mock/shot-" + Date.now() + ".png" },
    form_fill: { ...base, result: "Form fields populated (simulated). No submit." },
    submit: { ...base, result: "Form submitted (simulated). Confirmation #MOCK-" + Math.floor(Math.random()*99999) },
    book: { ...base, result: "Booking held (simulated). PNR: MOCK" + Math.random().toString(36).slice(2,7).toUpperCase() },
    pay: { ...base, result: "Payment authorized (simulated). Charge id: ch_mock_" + Date.now() },
    shell_execute: { ...base, result: "$ " + (args?.cmd ?? "cmd") + "\n(exit 0, simulated)" },
    web_research: { ...base, result: "3 sources found (simulated). Consensus: " + (args?.query ?? "unknown") + " → OK." },
    memory_search: { ...base, result: "2 memory hits (simulated) matching: " + JSON.stringify(args) },
    risk_classifier: { ...base, result: { level: "low", rationale: "No irreversible external effect detected (mock)." } },
    policy_checker: { ...base, result: { pass: true, notes: "No policy violation (mock)." } },
    source_verifier: { ...base, result: { verified: true, confidence: 0.86 } },
    test_runner: { ...base, result: "12 passed, 0 failed (simulated)." },
    plan_critic: { ...base, result: "Plan looks coherent; risk of skipping verification on step 3 (mock)." },
    approval_gate: { ...base, result: { approved: true, reason: "Within autonomous scope (mock)." } },
  };
  return canned[tool] ?? { ...base, result: "OK (simulated generic tool result)" };
}

// ── LLM helper ────────────────────────────────────────────────────
async function llm(system: string, user: string): Promise<string> {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + LOVABLE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error("LLM " + r.status + ": " + (await r.text()));
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { _parse_error: true, raw: s }; }
}

// ── Lobe prompts ──────────────────────────────────────────────────
const EXECUTOR_SYS = `You are the EXECUTOR LOBE of a dual-lobe agent.
You act on the world. You DO NOT judge, plan, or self-approve.
Allowed tools (executor-only): ${EXECUTOR_TOOLS.join(", ")}.
Strategist-only tools are FORBIDDEN and will be rejected: ${STRATEGIST_TOOLS.join(", ")}.

Every turn you output ONE JSON object:
{
  "message_type": "action_intent" | "escalation_request" | "done_signal",
  "payload": {
    "proposed_action": "...",
    "tool_requested": "<executor tool name>",
    "tool_args": { ... },
    "expected_result": "...",
    "risk_level_guess": "low|medium|high",
    "executor_confidence": 0.0-1.0,
    "question_for_strategist": "..."
  }
}
You may not execute anything without a fresh permit from the Strategist for THIS specific action.`;

const STRATEGIST_SYS = `You are the STRATEGIST LOBE of a dual-lobe agent.
You SEE, JUDGE, VERIFY, GATE. You do not act on the world.
Allowed tools (strategist-only): ${STRATEGIST_TOOLS.join(", ")}.
Executor-only tools are FORBIDDEN: ${EXECUTOR_TOOLS.join(", ")}.

Every turn you output ONE JSON object.
When responding to an action_intent:
{
  "message_type": "permit",
  "payload": {
    "decision": "permit"|"revise"|"block"|"research_needed",
    "reason": "...",
    "allowed_tools": ["<one executor tool>"],
    "blocked_tools": [],
    "next_instruction": "...",
    "ttl_seconds": 120
  }
}
When verifying a completed action:
{
  "message_type": "verify_result",
  "payload": { "outcome": "success"|"retry"|"repair"|"rollback", "evidence": ["..."], "notes": "..." }
}
When the task is complete:
{
  "message_type": "task_complete",
  "payload": { "summary": "...", "final_state": "..." }
}
You may optionally call ONE strategist tool first by emitting:
{ "message_type": "strategist_tool_call", "payload": { "tool": "<name>", "tool_args": {...} } }`;

// ── Orchestrator ──────────────────────────────────────────────────
async function runDemo(task: string, maxCycles = 6) {
  const runId = crypto.randomUUID();
  const ledger: any[] = [];
  const workspace: Record<string, any> = { task, observations: [] };
  let seq = 0;

  const log = (entry: any) => {
    ledger.push({ seq: ++seq, at: new Date().toISOString(), ...entry });
  };

  log({ kind: "run_start", task, run_id: runId });

  let lastVerification: any = null;
  let lastActionResult: any = null;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    log({ kind: "cycle_start", cycle });

    // === EXECUTOR proposes ===
    const execUserMsg = JSON.stringify({
      task,
      cycle,
      workspace_summary: workspace,
      last_verification: lastVerification,
      last_action_result: lastActionResult,
      instruction: "Propose the next single action, or emit done_signal if the task is fully completed and verified.",
    });
    const execRaw = await llm(EXECUTOR_SYS, execUserMsg);
    const execMsg = safeParse(execRaw);
    log({ kind: "executor_message", message: execMsg });

    if (execMsg.message_type === "done_signal") {
      log({ kind: "executor_declared_done", note: "Strategist must confirm — executor cannot self-complete." });
    }

    // === STRATEGIST reviews / permits ===
    const stratUserMsg = JSON.stringify({
      task,
      cycle,
      workspace_summary: workspace,
      executor_message: execMsg,
      instruction: "Decide: permit / revise / block / research_needed. Or emit task_complete if you can independently verify the task is done. Optionally emit strategist_tool_call first.",
    });
    const stratRaw = await llm(STRATEGIST_SYS, stratUserMsg);
    let stratMsg = safeParse(stratRaw);
    log({ kind: "strategist_message", message: stratMsg });

    // Optional: strategist runs a sense/verify tool first
    if (stratMsg.message_type === "strategist_tool_call") {
      const t = stratMsg.payload?.tool;
      if (!STRATEGIST_TOOLS.includes(t)) {
        log({ kind: "router_reject", reason: "Strategist tried non-strategist tool", tool: t });
      } else {
        const result = mockToolCall(t, stratMsg.payload?.tool_args ?? {}, "strategist");
        log({ kind: "tool_executed", ...result });
        workspace.observations.push({ from: "strategist_tool", ...result });

        // Second strategist turn — now with the tool result
        const stratRaw2 = await llm(STRATEGIST_SYS, JSON.stringify({
          task, cycle, workspace_summary: workspace,
          executor_message: execMsg,
          your_previous_tool_result: result,
          instruction: "Now emit permit / verify_result / task_complete.",
        }));
        stratMsg = safeParse(stratRaw2);
        log({ kind: "strategist_message", message: stratMsg });
      }
    }

    if (stratMsg.message_type === "task_complete") {
      log({ kind: "task_complete", summary: stratMsg.payload });
      break;
    }

    if (stratMsg.message_type !== "permit" || stratMsg.payload?.decision !== "permit") {
      log({ kind: "action_blocked_or_revised", decision: stratMsg.payload?.decision });
      lastVerification = { outcome: "blocked", notes: stratMsg.payload?.reason };
      lastActionResult = null;
      continue;
    }

    // === Tool Router: enforce ownership ===
    const requestedTool = execMsg.payload?.tool_requested;
    if (!EXECUTOR_TOOLS.includes(requestedTool)) {
      log({ kind: "router_reject", reason: "Executor requested a non-executor tool", tool: requestedTool });
      lastVerification = { outcome: "retry", notes: "Tool ownership violation." };
      continue;
    }
    const permittedTools: string[] = stratMsg.payload?.allowed_tools ?? [];
    if (!permittedTools.includes(requestedTool)) {
      log({ kind: "router_reject", reason: "Requested tool not in permit's allowed_tools", tool: requestedTool, permitted: permittedTools });
      lastVerification = { outcome: "retry", notes: "Permit did not cover requested tool." };
      continue;
    }

    // === Execute (mocked) ===
    const toolResult = mockToolCall(requestedTool, execMsg.payload?.tool_args ?? {}, "executor");
    log({ kind: "tool_executed", ...toolResult });
    workspace.observations.push({ from: "executor_tool", ...toolResult });
    lastActionResult = toolResult;

    // === Strategist verifies ===
    const verifyRaw = await llm(STRATEGIST_SYS, JSON.stringify({
      task, cycle, workspace_summary: workspace,
      action_that_ran: { tool: requestedTool, args: execMsg.payload?.tool_args, result: toolResult },
      instruction: "Emit ONLY a verify_result envelope for the action above.",
    }));
    const verifyMsg = safeParse(verifyRaw);
    log({ kind: "strategist_message", message: verifyMsg });
    lastVerification = verifyMsg.payload ?? { outcome: "retry" };
  }

  log({ kind: "run_end" });
  return { run_id: runId, ledger, workspace };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_cycles } = await req.json();
    if (!task) throw new Error("task is required");
    const result = await runDemo(task, Math.min(max_cycles ?? 6, 10));
    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
