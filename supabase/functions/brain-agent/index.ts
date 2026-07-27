// BRAIN-AGENT — an attempt to model the loop the way a real brain runs it.
//
// Regions and their jobs:
//
//   THALAMUS         gate/filter raw input into "salient facts" (deterministic,
//                    no LLM) — a real thalamus decides what even reaches cortex.
//   AMYGDALA         tag salience/urgency on each fact (fast, keyword+heuristic,
//                    no LLM). Boosted facts get more attention.
//   HIPPOCAMPUS      episodic memory: append every event, retrieve top-k by
//                    recency+relevance when cortex asks. Consolidates on sleep.
//   PFC              (prefrontal cortex) goal-keeper + planner. One LLM call
//                    per cycle. Emits a SHORT plan + top-3 candidate actions.
//   BASAL_GANGLIA    action selection. Scores each candidate by
//                    (utility − risk − cost) and picks ONE. Deterministic.
//   MOTOR_CORTEX     executes the chosen action via a tool. No LLM. Reflex arc
//                    short-circuits for known-safe reads.
//   CEREBELLUM       prediction-error: compares PFC's expected outcome to the
//                    actual result and stores the delta. Feeds back into PFC's
//                    next planning prompt so it adapts.
//   CORPUS_CALLOSUM  ~200-token compressed bus between regions — NOT the full
//                    transcript. A real corpus callosum is bandwidth-limited.
//   REFLEX_ARC       spinal-reflex shortcut. If the plan is a known-safe read
//                    (http_get, list_tables), skip PFC-cortex round-trip.
//
// Key design principle: no single region sees everything. Each has a narrow
// input, does one job, hands off a small message. That's how a brain scales.
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
const READ_TOOLS  = new Set(["db_read", "list_tables", "list_edge_functions", "http_get", "tool_registry"]);
const WRITE_TOOLS = new Set(["db_write", "http_post", "invoke_edge_function", "send_notification"]);

// ─────────────────────────────────────────────────────────────────
// Shared brain state (only one "brain" per request — no global bleed)
// ─────────────────────────────────────────────────────────────────
type Fact = { at: number; text: string; salience: number; source: string };
type Episode = { at: number; kind: string; summary: string; salience: number; data?: any };
type Prediction = { action: string; expected: string };

type Brain = {
  task: string;
  workspace: string;              // corpus-callosum bus (short)
  hippocampus: Episode[];         // episodic memory
  attention: Fact[];              // currently-attended facts (thalamus output)
  last_prediction: Prediction | null;
  cerebellum_deltas: string[];    // recent prediction errors
  goal_progress: string;          // PFC's running belief about progress
};

function newBrain(task: string): Brain {
  return {
    task,
    workspace: "TASK: " + task,
    hippocampus: [],
    attention: [],
    last_prediction: null,
    cerebellum_deltas: [],
    goal_progress: "unstarted",
  };
}

// ─────────────────────────────────────────────────────────────────
// THALAMUS — gate raw signal into salient facts (no LLM)
// ─────────────────────────────────────────────────────────────────
function thalamus(raw: string, source: string): Fact | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, 400);
  if (trimmed.length < 8) return null;
  return { at: Date.now(), text: trimmed, salience: 0.5, source };
}

// ─────────────────────────────────────────────────────────────────
// AMYGDALA — tag salience (no LLM; keyword + heuristic)
// ─────────────────────────────────────────────────────────────────
const URGENT = /\b(error|fail|denied|blocked|unauthori[sz]ed|429|500|conflict|missing|null|empty)\b/i;
const REWARD = /\b(ok|success|inserted|updated|received|200|created|complete)\b/i;
function amygdala(f: Fact): Fact {
  let s = f.salience;
  if (URGENT.test(f.text)) s = Math.min(1, s + 0.4);
  if (REWARD.test(f.text)) s = Math.min(1, s + 0.2);
  if (f.source === "task") s = 1;
  return { ...f, salience: s };
}

// ─────────────────────────────────────────────────────────────────
// HIPPOCAMPUS — episodic memory (recency + salience retrieval)
// ─────────────────────────────────────────────────────────────────
function hippoStore(brain: Brain, ep: Episode) {
  brain.hippocampus.push(ep);
  if (brain.hippocampus.length > 40) brain.hippocampus.shift();  // decay
}
function hippoRecall(brain: Brain, k = 5): Episode[] {
  const now = Date.now();
  return [...brain.hippocampus]
    .map((e) => ({ e, score: e.salience * 0.7 + (1 / (1 + (now - e.at) / 1000)) * 0.3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.e);
}

// ─────────────────────────────────────────────────────────────────
// PFC — planning cortex (ONE LLM call per cycle)
// Emits: goal_progress, expected_outcome (prediction), top-3 candidates.
// ─────────────────────────────────────────────────────────────────
type Candidate = { tool: string; args: any; why: string; expected: string; utility: number; risk: number; cost: number };

async function pfc(brain: Brain, mode: string, model: string, consult?: string): Promise<{ candidates: Candidate[]; goal_progress: string; done: boolean; note: string; request_consult: boolean }> {
  const memory = hippoRecall(brain, 5)
    .map((e) => "- [" + new Date(e.at).toISOString().slice(11, 19) + "] " + e.kind + ": " + e.summary)
    .join("\n") || "(none)";
  const attn = brain.attention
    .slice(-6)
    .map((f) => "- (" + f.salience.toFixed(2) + ") " + f.text)
    .join("\n") || "(none)";
  const deltas = brain.cerebellum_deltas.slice(-3).join(" | ") || "(no prediction errors yet)";

  const sys = `You are the PREFRONTAL CORTEX of a brain-inspired agent.

Your role, and ONLY your role:
- Hold the goal in working memory.
- Read the attention window and episodic memory.
- Adapt to prediction errors reported by the cerebellum.
- Emit up to 3 candidate motor actions, each with an expected outcome so cerebellum can score you.
- You do NOT execute tools. You do NOT choose which candidate runs — basal ganglia does that.

Allowlisted read tools: ${[...READ_TOOLS].join(", ")}
Allowlisted write tools: ${[...WRITE_TOOLS].join(", ")}
Allowlisted DB tables: ${[...ALLOWLIST_TABLES].join(", ")}
Mode: ${mode} (in safe mode all writes are blocked; propose reads instead).

Return ONE JSON object:
{
  "goal_progress": "one short sentence of where the task stands",
  "done": false,
  "note": "one-line rationale addressed to basal ganglia",
  "request_consult": false,   // set true ONLY when you are stuck, facing an ambiguous route, a real blocker, or a high-risk decision that would benefit from a second lobe's opinion. Do NOT set true for routine progress.
  "candidates": [
    { "tool": "<toolname>", "args": {...}, "why": "why this helps", "expected": "what you predict will happen", "utility": 0..1, "risk": 0..1, "cost": 0..1 }
  ]
}
Keep candidates <= 3. Set done=true only when task is genuinely complete.`;

  const user = `GOAL: ${brain.task}

Progress so far: ${brain.goal_progress}

Attention window (thalamus → amygdala):
${attn}

Recent episodic memory (hippocampus top-k):
${memory}

Cerebellum feedback (recent prediction errors):
${deltas}
${consult ? "\nCONSULT from motor-lobe (advisory, use if useful):\n" + consult : ""}`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!r.ok) throw new Error("PFC " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  let parsed: any = {};
  try { parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
  const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates: Candidate[] = raw.slice(0, 3).map((c: any) => ({
    tool: String(c.tool || ""),
    args: c.args || {},
    why: String(c.why || "").slice(0, 200),
    expected: String(c.expected || "").slice(0, 200),
    utility: clamp01(c.utility, 0.5),
    risk: clamp01(c.risk, 0.3),
    cost: clamp01(c.cost, 0.2),
  })).filter((c: Candidate) => c.tool);
  return {
    candidates,
    goal_progress: String(parsed.goal_progress || brain.goal_progress).slice(0, 200),
    done: !!parsed.done,
    note: String(parsed.note || "").slice(0, 200),
    request_consult: !!parsed.request_consult,
  };
}

// ─────────────────────────────────────────────────────────────────
// MOTOR-LOBE CONSULT — second LLM, only invoked when gated.
// Gate opens on: PFC asks, ≥2 recent prediction errors, same tool failed twice,
// or 2 cycles of unchanged goal_progress. Otherwise this stays silent.
// Keep the prompt tiny — this is an advisory, not a re-plan.
// ─────────────────────────────────────────────────────────────────
async function motorConsult(brain: Brain, lastCandidates: Candidate[], model: string): Promise<string> {
  const sys = `You are the MOTOR LOBE offering a brief second opinion to the PFC.
The PFC is stuck or facing a hard choice. Reply in ONE or TWO short sentences:
- Point out the concrete tool + args that would break the deadlock, OR
- Name the assumption that seems wrong, OR
- Say "no better option, proceed" if PFC's plan looks fine.
No preamble, no JSON, plain text under 240 chars.`;
  const cands = lastCandidates.map((c) => "- " + c.tool + " (u=" + c.utility + ", r=" + c.risk + "): " + c.why).join("\n") || "(none)";
  const user = `GOAL: ${brain.task}
Progress: ${brain.goal_progress}
Recent prediction errors: ${brain.cerebellum_deltas.slice(-3).join(" | ") || "(none)"}
PFC's current candidates:
${cands}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0.4,
      max_tokens: 120,
    }),
  });
  if (!r.ok) return "(consult unavailable: " + r.status + ")";
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? "").trim().slice(0, 240);
}
function clamp01(x: any, d: number) { const n = Number(x); return isFinite(n) ? Math.max(0, Math.min(1, n)) : d; }

// ─────────────────────────────────────────────────────────────────
// BASAL GANGLIA — pick ONE action. Deterministic scoring.
// ─────────────────────────────────────────────────────────────────
function basalGanglia(candidates: Candidate[], mode: string): { winner: Candidate | null; scores: Array<{ tool: string; score: number }> } {
  const scored = candidates.map((c) => {
    let score = c.utility - c.risk * 0.8 - c.cost * 0.3;
    if (mode === "safe" && WRITE_TOOLS.has(c.tool)) score -= 1;  // inhibit writes in safe mode
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { winner: scored[0]?.c ?? null, scores: scored.map((s) => ({ tool: s.c.tool, score: +s.score.toFixed(3) })) };
}

// ─────────────────────────────────────────────────────────────────
// MOTOR CORTEX + REFLEX ARC — execute chosen tool. No LLM.
// ─────────────────────────────────────────────────────────────────
async function motorCortex(action: Candidate, mode: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t0 = Date.now();
  try {
    const result = await execTool(action.tool, action.args, mode, supabase);
    return { ok: result.ok, result: result.result, error: result.error, ms: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), ms: Date.now() - t0 };
  }
}

async function execTool(tool: string, args: any, mode: string, supabase: any) {
  switch (tool) {
    case "tool_registry":  return { ok: true, result: { read: [...READ_TOOLS], write: [...WRITE_TOOLS], tables: [...ALLOWLIST_TABLES] } };
    case "list_tables":    return { ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
    case "list_edge_functions": return { ok: true, result: { functions: ["duffel-search", "send-notification", "chat", "war-room", "brain-agent"] } };
    case "db_read": {
      const { table, select = "*", eq, limit = 20 } = args || {};
      if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
      let q = supabase.from(table).select(select).limit(Math.min(limit, 100));
      if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
      const { data, error } = await q;
      if (error) throw error;
      return { ok: true, result: { rows: data } };
    }
    case "http_get": {
      const { url, headers } = args || {};
      if (!url) throw new Error("url required");
      const r = await fetch(url, { headers: headers || {} });
      return { ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
    }
    case "db_write": {
      if (mode !== "full") throw new Error("db_write blocked in safe mode");
      const { table, op = "insert", values, eq } = args || {};
      if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
      if (op === "insert") {
        const { data, error } = await supabase.from(table).insert(values).select();
        if (error) throw error;
        return { ok: true, result: { inserted: data } };
      }
      if (op === "update") {
        let q = supabase.from(table).update(values);
        if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        const { data, error } = await q.select();
        if (error) throw error;
        return { ok: true, result: { updated: data } };
      }
      throw new Error("unknown op " + op);
    }
    case "http_post": {
      const { url, headers, body } = args || {};
      if (!url) throw new Error("url required");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers || {}) },
        body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
      });
      return { ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
    }
    case "invoke_edge_function": {
      if (mode !== "full") throw new Error("invoke_edge_function blocked in safe mode");
      const { name, body } = args || {};
      const r = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
        body: JSON.stringify(body ?? {}),
      });
      return { ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
    }
    case "send_notification": {
      const r = await fetch(SUPABASE_URL + "/functions/v1/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
        body: JSON.stringify(args || {}),
      });
      return { ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 2000) } };
    }
    default: throw new Error("unknown tool " + tool);
  }
}

// ─────────────────────────────────────────────────────────────────
// CEREBELLUM — prediction-error delta (no LLM; textual similarity heuristic)
// ─────────────────────────────────────────────────────────────────
function cerebellum(pred: Prediction | null, actual: any): string | null {
  if (!pred) return null;
  const actualStr = typeof actual === "string" ? actual : JSON.stringify(actual ?? "").slice(0, 400);
  const p = pred.expected.toLowerCase();
  const a = actualStr.toLowerCase();
  const overlap = p.split(/\W+/).filter((w) => w.length > 3 && a.includes(w)).length;
  if (overlap >= 2) return null;  // prediction roughly matched → no error
  return "predicted '" + pred.expected.slice(0, 80) + "' but got '" + actualStr.slice(0, 80) + "'";
}

// ─────────────────────────────────────────────────────────────────
// MAIN LOOP — one full brain "tick" = perceive → plan → select → act → learn
// ─────────────────────────────────────────────────────────────────
async function run(task: string, maxCycles: number, mode: "safe" | "full", model: string) {
  const runId = crypto.randomUUID();
  const t0 = Date.now();
  const brain = newBrain(task);
  const trace: any[] = [];
  let seq = 0;
  const log = (region: string, payload: any) => trace.push({ seq: ++seq, at_ms: Date.now() - t0, region, ...payload });

  // seed thalamus with the task
  const seed = amygdala(thalamus(task, "task")!);
  brain.attention.push(seed);
  hippoStore(brain, { at: Date.now(), kind: "task_received", summary: task, salience: 1 });
  log("thalamus", { gated: seed });

  let llmCalls = 0, toolCalls = 0, cycles = 0, reflexes = 0, consults = 0, done = false;
  let pendingConsult: string | undefined;         // advice from motor-lobe, delivered to NEXT pfc call
  let prevProgress = "";                          // to detect stalls
  let stallCount = 0;
  const toolFailCount: Record<string, number> = {};

  while (cycles < maxCycles && !done) {
    cycles++;
    log("tick", { cycle: cycles, workspace: brain.workspace.slice(0, 120), consult_carried: !!pendingConsult });

    // 1. PFC plans (with optional consult from previous cycle)
    const plan = await pfc(brain, mode, model, pendingConsult);
    llmCalls++;
    pendingConsult = undefined;
    log("pfc", { goal_progress: plan.goal_progress, note: plan.note, request_consult: plan.request_consult, candidates: plan.candidates.map((c) => ({ tool: c.tool, why: c.why, u: c.utility, r: c.risk })) });
    brain.goal_progress = plan.goal_progress;
    if (plan.done) { log("pfc", { verdict: "task_complete" }); done = true; break; }
    if (!plan.candidates.length) { log("pfc", { verdict: "no_candidates_stopping" }); break; }

    // 2. Basal ganglia selects
    const selection = basalGanglia(plan.candidates, mode);
    log("basal_ganglia", { scores: selection.scores, winner: selection.winner?.tool });
    if (!selection.winner) { log("basal_ganglia", { verdict: "all_inhibited" }); break; }
    const action = selection.winner;

    // 3. Reflex-arc shortcut? (safe reads with no args-of-doom)
    const isReflex = READ_TOOLS.has(action.tool) && action.risk < 0.2;
    if (isReflex) { reflexes++; log("reflex_arc", { engaged: true, tool: action.tool }); }

    // 4. Record prediction for cerebellum to compare against
    brain.last_prediction = { action: action.tool, expected: action.expected };

    // 5. Motor cortex executes
    const outcome = await motorCortex(action, mode);
    toolCalls++;
    log("motor_cortex", { tool: action.tool, ok: outcome.ok, ms: outcome.ms, error: outcome.error });
    if (!outcome.ok) toolFailCount[action.tool] = (toolFailCount[action.tool] || 0) + 1;

    // 6. Perception: outcome → thalamus → amygdala → attention → hippocampus
    const raw = outcome.ok ? JSON.stringify(outcome.result).slice(0, 400) : ("ERROR: " + outcome.error);
    const gated = thalamus(raw, action.tool);
    if (gated) {
      const tagged = amygdala(gated);
      brain.attention.push(tagged);
      if (brain.attention.length > 8) brain.attention.shift();  // attention decay
      log("thalamus", { gated: tagged });
    }
    hippoStore(brain, { at: Date.now(), kind: outcome.ok ? "action_ok" : "action_err", summary: action.tool + " → " + raw.slice(0, 80), salience: outcome.ok ? 0.4 : 0.9 });

    // 7. Cerebellum: prediction error?
    const delta = cerebellum(brain.last_prediction, outcome.ok ? outcome.result : outcome.error);
    if (delta) {
      brain.cerebellum_deltas.push(delta);
      if (brain.cerebellum_deltas.length > 5) brain.cerebellum_deltas.shift();
      log("cerebellum", { prediction_error: delta });
    } else {
      log("cerebellum", { prediction_ok: true });
    }

    // 8. Corpus callosum: compress the last event into the shared workspace bus
    brain.workspace = ("↳ " + action.tool + (outcome.ok ? " ok " : " ERR ") + (delta ? "· Δ" : "")).slice(0, 200);

    // 9. Stall detector — is goal_progress unchanged?
    if (brain.goal_progress === prevProgress) stallCount++; else stallCount = 0;
    prevProgress = brain.goal_progress;

    // 10. DIALOGUE GATE — only wake the motor-lobe when there's a real reason.
    const recentErrCount = brain.cerebellum_deltas.length;
    const sameToolTwice = toolFailCount[action.tool] >= 2;
    const reasons: string[] = [];
    if (plan.request_consult) reasons.push("pfc_requested");
    if (recentErrCount >= 2)  reasons.push("prediction_errors:" + recentErrCount);
    if (sameToolTwice)        reasons.push("tool_failed_twice:" + action.tool);
    if (stallCount >= 2)      reasons.push("stalled:" + stallCount);

    if (reasons.length > 0) {
      log("dialogue_gate", { open: true, reasons });
      const advice = await motorConsult(brain, plan.candidates, model);
      llmCalls++; consults++;
      log("motor_consult", { advice });
      pendingConsult = advice;                     // handed to next pfc turn
      // reset stall so we don't consult every cycle in a row
      stallCount = 0;
      brain.cerebellum_deltas = [];
    } else {
      log("dialogue_gate", { open: false });
    }
  }

  // "Sleep" — consolidate: keep only top-salience episodes
  brain.hippocampus.sort((a, b) => b.salience - a.salience);
  const consolidated = brain.hippocampus.slice(0, 10);
  log("sleep", { consolidated_count: consolidated.length });

  const elapsed = Date.now() - t0;
  log("run_end", { elapsed_ms: elapsed, cycles, llm_calls: llmCalls, tool_calls: toolCalls, reflexes });

  return {
    run_id: runId,
    trace,
    ledger: trace,  // alias so the bench's scoreboard reads uniform fields
    brain_final: {
      goal_progress: brain.goal_progress,
      attention: brain.attention,
      consolidated_memory: consolidated,
      cerebellum_deltas: brain.cerebellum_deltas,
    },
    stats: {
      elapsed_ms: elapsed,
      cycles,
      llm_calls: llmCalls,
      tool_calls: toolCalls,
      reflexes,
      model_of_thought: "brain:7-region",
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Transcript adapter — so the bench UI's <Bubble/> renders this run.
// One "message" per cycle, showing which regions fired and why.
// ─────────────────────────────────────────────────────────────────
function traceToTranscript(trace: any[]): any[] {
  const transcript: any[] = [{ speaker: "system", say: "TASK dispatched → thalamus" }];
  const byCycle: Record<number, any[]> = {};
  let currentCycle = 0;
  for (const t of trace) {
    if (t.region === "tick") currentCycle = t.cycle;
    (byCycle[currentCycle] ||= []).push(t);
  }
  for (const [cycle, events] of Object.entries(byCycle)) {
    if (cycle === "0") continue;
    const pfcEvent = events.find((e) => e.region === "pfc" && e.candidates);
    const bg = events.find((e) => e.region === "basal_ganglia" && e.winner);
    const motor = events.find((e) => e.region === "motor_cortex");
    const cere = events.find((e) => e.region === "cerebellum");
    const summary = [
      "🧠 PFC: " + (pfcEvent?.note || "…"),
      "⚖️ Basal ganglia → " + (bg?.winner || "none"),
      motor ? ("⚡ Motor · " + motor.tool + " " + (motor.ok ? "✓" : "✗") + " " + motor.ms + "ms") : "",
      cere?.prediction_error ? ("🎯 Cerebellum Δ: " + cere.prediction_error) : (cere ? "🎯 Cerebellum: prediction ok" : ""),
    ].filter(Boolean).join("\n");
    transcript.push({
      speaker: cycle === Object.keys(byCycle).slice(-1)[0] ? "motor" : "sensory",
      say: "cycle " + cycle + "\n" + summary,
      tool: motor ? { name: motor.tool, args: {} } : null,
      tool_result: motor ? { ok: motor.ok, error: motor.error } : undefined,
    });
  }
  return transcript;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { task, max_cycles, mode, model } = await req.json();
    if (!task) throw new Error("task is required");
    const runMode: "safe" | "full" = mode === "full" ? "full" : "safe";
    const result = await run(task, Math.min(max_cycles ?? 8, 15), runMode, model || "google/gemini-2.5-flash");
    const transcript = traceToTranscript(result.trace);
    return new Response(JSON.stringify({ ...result, transcript }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
