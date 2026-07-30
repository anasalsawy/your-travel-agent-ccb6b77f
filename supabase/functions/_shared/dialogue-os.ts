// Dialogue OS — the governance layer every autonomous agent runs under.
// It is deliberately vendor-neutral: an agent is a (strategist, executor) pair
// plus a charter, a toolset, and a policy envelope. Nothing here knows about
// travel specifically — the domain lives in the seeded agent charters.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { llm, safeParse, execTool, type Mode } from "./lobe-runtime.ts";
import { bus, spawn } from "./bus.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);

export type AoAgent = {
  agent_key: string;
  display_name: string;
  department: string;
  charter: string;
  strategist_prompt: string;
  executor_prompt: string;
  tools: string[];
  addons: Record<string, boolean>;
  autonomy_level: number;
  model: string;
  status: string;
};

export type Mission = {
  id: string;
  title: string;
  stage: string;
  priority: number;
  source?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  payload: Record<string, unknown>;
  expected_value?: number | null;
  owner_agent?: string | null;
  status: string;
  needs_human: boolean;
};

// Canonical end-to-end pipeline. Each stage has a default owner; Chief of Staff
// may override, but never skip an unmet precondition.
export const PIPELINE: Array<{ stage: string; owner: string; goal: string; next: string }> = [
  { stage: "lead", owner: "scout", goal: "Capture and enrich the opportunity so it can be judged.", next: "qualify" },
  { stage: "qualify", owner: "vetter", goal: "Decide qualified / nurture / reject with a reason.", next: "source" },
  { stage: "source", owner: "hunter", goal: "Find the cheapest viable itinerary that clears the margin floor.", next: "quote" },
  { stage: "quote", owner: "quoter", goal: "Present a priced offer and obtain acceptance.", next: "collect" },
  { stage: "collect", owner: "teller", goal: "Collect payment in full or on an approved plan.", next: "fulfill" },
  { stage: "fulfill", owner: "fulfiller", goal: "Issue the ticket and capture proof (PNR).", next: "serve" },
  { stage: "serve", owner: "guardian", goal: "Handle disruption, complaints and remedies through travel.", next: "relate" },
  { stage: "relate", owner: "concierge", goal: "Post-trip relationship: thanks, review, ancillary, win-back.", next: "audit" },
  { stage: "audit", owner: "auditor", goal: "Score the mission and promote durable lessons.", next: "closed" },
  { stage: "closed", owner: "chief", goal: "Mission complete.", next: "closed" },
];

export function stageSpec(stage: string) {
  return PIPELINE.find((p) => p.stage === stage) ?? PIPELINE[0];
}

// log()/event() are DIALOGUE-LANE writes: they enqueue on the bus and return
// immediately. The execution lane never waits on narration.
export function log(
  missionId: string | null,
  from: string,
  content: string,
  opts: { to?: string; lobe?: string; kind?: string; meta?: Record<string, unknown> } = {},
) {
  bus.say(missionId, from, content, opts);
}

export function event(
  missionId: string | null,
  agentKey: string | null,
  type: string,
  summary: string,
  detail: Record<string, unknown> = {},
) {
  bus.emit(missionId, agentKey, type, summary, detail);
}

export async function loadPolicies(): Promise<Record<string, any>> {
  const { data } = await sb().from("ao_policies").select("policy_key,value,is_active").eq("is_active", true);
  const out: Record<string, any> = {};
  for (const p of data ?? []) out[p.policy_key] = p.value;
  return out;
}

export function policyBlock(p: Record<string, any>): string {
  return [
    "POLICY ENVELOPE (hard limits — violating any of these is a failure, not a trade-off):",
    `- Spend cap per mission: $${p.spend_cap_per_mission?.usd ?? 0}`,
    `- Minimum net margin: $${p.min_margin?.usd ?? 0} or ${p.min_margin?.percent ?? 0}%`,
    `- Discount ceiling: ${p.discount_ceiling?.percent ?? 0}%`,
    `- Refund authority without a human: $${p.refund_authority?.usd ?? 0}`,
    `- Escalate to a human on: ${Object.keys(p.escalation_rules ?? {}).join(", ")}`,
    `- Customer quiet hours: ${p.quiet_hours?.start ?? "-"}–${p.quiet_hours?.end ?? "-"} local`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// One dual-lobe turn: Strategist judges, Executor acts. Both are bounded by
// the agent charter + the policy envelope, and both write to the dialogue bus.
// ---------------------------------------------------------------------------
export type LobeTurn = {
  agent: string;
  plan: string;
  action?: { name: string; args: Record<string, unknown> } | null;
  toolResult?: unknown;
  report: string;
  handoff?: string | null;
  advanceStage: boolean;
  escalate?: { reason: string } | null;
  /** Per-region wall-clock, so the orchestrator can prove where time went. */
  timings?: Record<string, number>;
};

// Business capabilities are capability-shaped, never vendor-shaped: agents ask
// for "search_flights", not for a specific supplier. Swapping the supplier is a
// change here and nowhere else.
const BIZ_TOOLS: Record<string, { fn: string; readOnly: boolean; doc: string }> = {
  search_flights: { fn: "duffel-search", readOnly: true, doc: 'search_flights {origin,destination,departure_date,return_date?,adults,children?,infants?,cabin_class?}' },
  search_stays: { fn: "duffel-stays-search", readOnly: true, doc: 'search_stays {location,check_in,check_out,guests}' },
  search_cars: { fn: "duffel-cars-search", readOnly: true, doc: 'search_cars {pickup_location,pickup_date,dropoff_date}' },
  price_quote: { fn: "claude-quote", readOnly: true, doc: 'price_quote {route,dates,passengers} — margin-aware quoting engine' },
  create_payment_link: { fn: "duffel-create-checkout", readOnly: false, doc: 'create_payment_link {offer_id,amount,currency,email}' },
  book_ticket: { fn: "duffel-book", readOnly: false, doc: 'book_ticket {offer_id,passengers,contact_email}' },
  notify_customer: { fn: "send-notification", readOnly: false, doc: 'notify_customer {to,subject,message}' },
};

export function toolCatalog(tools: string[]): string {
  const biz = Object.entries(BIZ_TOOLS).filter(([k]) => tools.includes(k) || true)
    .map(([, v]) => "  - " + v.doc).join("\n");
  return [
    "CAPABILITY CATALOG (call these by name — never invent URLs, never guess an external API):",
    biz,
    "  - db_read {table,select?,eq?,limit?} / db_write {table,op,values,eq?} on allowlisted tables",
    "Use http_get ONLY for a URL that already appears in the mission payload.",
  ].join("\n");
}

async function runBizTool(name: string, args: Record<string, unknown>, mode: Mode) {
  const spec = BIZ_TOOLS[name];
  if (!spec) return null;
  if (!spec.readOnly && mode !== "full") {
    return { tool: name, ok: false, error: `${name} blocked in safe mode (would mutate or spend)` };
  }
  try {
    const r = await fetch(SUPABASE_URL + "/functions/v1/" + spec.fn, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + SERVICE_ROLE },
      body: JSON.stringify(args ?? {}),
    });
    const text = (await r.text()).slice(0, 3000);
    return { tool: name, ok: r.ok, result: { status: r.status, body: text } };
  } catch (e) {
    return { tool: name, ok: false, error: (e as Error).message };
  }
}

export async function runDualLobeTurn(
  agent: AoAgent,
  mission: Mission,
  goal: string,
  policies: Record<string, any>,
  mode: Mode,
): Promise<LobeTurn> {
  const missionCard = JSON.stringify({
    id: mission.id, title: mission.title, stage: mission.stage,
    customer: { name: mission.customer_name, email: mission.customer_email },
    payload: mission.payload, expected_value: mission.expected_value, source: mission.source,
  }).slice(0, 3000);

  const { data: recent } = await sb().from("ao_dialogue")
    .select("from_agent,lobe,content").eq("mission_id", mission.id)
    .order("created_at", { ascending: false }).limit(8);
  const history = (recent ?? []).reverse()
    .map((r) => `${r.from_agent}${r.lobe ? "/" + r.lobe : ""}: ${r.content}`).join("\n").slice(0, 2500);

  // ---- STRATEGIST LOBE (sense + judge) ------------------------------------
  const stratSys = [
    `You are the STRATEGIST lobe of "${agent.display_name}" (${agent.department}).`,
    `CHARTER: ${agent.charter}`,
    agent.strategist_prompt,
    policyBlock(policies),
    `STAGE GOAL: ${goal}`,
    `Available executor tools: ${agent.tools.join(", ")}.`,
    toolCatalog(agent.tools),
    `Mode: ${mode} — in safe mode any spending or mutating capability is blocked; plan around it, do not retry it.`,
    "If a capability fails twice for the same reason, stop retrying: either take a different route or mark the stage complete with the finding.",
    "",
    'Emit ONE JSON object: {"plan":"one concrete next step","action":{"name":"tool","args":{}}|null,"escalate":{"reason":"..."}|null,"stage_complete":boolean}',
    "Be decisive. No acknowledgments, no restating the mission. Escalate ONLY when the policy envelope requires a human.",
  ].join("\n");

  const stratRaw = await llm(stratSys, [{ role: "user", content: `MISSION:\n${missionCard}\n\nRECENT BUS:\n${history || "(empty)"}` }], agent.model, { max_tokens: 700 });
  const strat = safeParse(stratRaw);
  const plan: string = strat.plan ?? strat.say ?? "(no plan)";
  await log(mission.id, agent.agent_key, plan, { lobe: "strategist", kind: "plan" });

  if (strat.escalate?.reason) {
    return { agent: agent.agent_key, plan, report: "Escalated by strategist.", advanceStage: false, escalate: { reason: String(strat.escalate.reason) } };
  }

  // ---- EXECUTOR LOBE (act + report) ---------------------------------------
  let toolResult: unknown = null;
  const action = strat.action && strat.action.name ? strat.action : null;
  if (action) {
    toolResult = (await runBizTool(action.name, action.args ?? {}, mode))
      ?? (await execTool(action.name, action.args ?? {}, agent.tools, mode));
    await log(mission.id, agent.agent_key, `${action.name}(${JSON.stringify(action.args ?? {}).slice(0, 300)})`, {
      lobe: "executor", kind: "tool", meta: { result: JSON.stringify(toolResult).slice(0, 1500) },
    });
  }

  const execSys = [
    `You are the EXECUTOR lobe of "${agent.display_name}".`,
    agent.executor_prompt,
    policyBlock(policies),
    `STAGE GOAL: ${goal}`,
    "",
    'Emit ONE JSON object: {"report":"what is now true, with evidence","mission_patch":{},"stage_complete":boolean,"handoff":"agent_key or null"}',
    "mission_patch may set: payload (merged object), expected_value, realized_value, customer_name, customer_email, outcome.",
    "Report facts only. No filler.",
  ].join("\n");

  const execRaw = await llm(execSys, [{
    role: "user",
    content: `MISSION:\n${missionCard}\n\nSTRATEGIST PLAN:\n${plan}\n\nTOOL RESULT:\n${JSON.stringify(toolResult ?? null).slice(0, 2000)}`,
  }], agent.model, { max_tokens: 700 });
  const exec = safeParse(execRaw);
  const report: string = exec.report ?? exec.say ?? "(no report)";
  await log(mission.id, agent.agent_key, report, { lobe: "executor", kind: "report" });

  // Apply the mission patch under service role.
  const patch = exec.mission_patch ?? {};
  const update: Record<string, unknown> = {};
  if (patch.payload && typeof patch.payload === "object") {
    update.payload = { ...(mission.payload ?? {}), ...patch.payload };
  }
  for (const k of ["expected_value", "realized_value", "customer_name", "customer_email", "outcome"]) {
    if (patch[k] !== undefined && patch[k] !== null) update[k] = patch[k];
  }
  if (Object.keys(update).length) await sb().from("ao_missions").update(update).eq("id", mission.id);

  return {
    agent: agent.agent_key,
    plan,
    action,
    toolResult,
    report,
    handoff: exec.handoff ?? null,
    advanceStage: Boolean(exec.stage_complete ?? strat.stage_complete),
  };
}

// ---------------------------------------------------------------------------
// BRAIN-7 TURN — the 7-region runtime stacked on the dual-lobe base.
//
//   1 thalamus       relay + gating of mission signals into the attention window
//   2 amygdala       salience tagging (value at risk, anger, deadline)
//   3 prefrontal     goal-holding, emits up to 3 candidate actions with predictions
//   4 basal ganglia  deterministic action selection (utility − risk − cost)
//   5 motor          executes exactly one selected capability
//   6 cerebellum     prediction-error signal, corrects the next cycle
//   7 hippocampus    episodic write-back onto the dialogue bus
//
// Removing this layer leaves the plain dual-lobe turn intact.
// ---------------------------------------------------------------------------
type Candidate = { tool: string; args: Record<string, unknown>; why: string; expected: string; utility: number; risk: number; cost: number };

const clamp01 = (x: unknown, d: number) => {
  const n = Number(x);
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
};

function thalamus(mission: Mission, goal: string): string[] {
  const p = mission.payload ?? {};
  const signals = [
    `stage=${mission.stage} priority=${mission.priority}`,
    `goal=${goal}`,
    mission.customer_name ? `customer=${mission.customer_name}` : "",
    mission.expected_value ? `value_at_risk=$${mission.expected_value}` : "",
    ...Object.entries(p).slice(0, 8).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`),
  ].filter(Boolean);
  return signals;
}

function amygdala(signals: string[], mission: Mission): Array<{ text: string; salience: number }> {
  const hot = /(angry|complaint|missed|cancel|refund|urgent|today|tomorrow|dispute|chargeback)/i;
  const value = Number(mission.expected_value ?? 0);
  return signals.map((text) => {
    let s = 0.3;
    if (hot.test(text)) s += 0.5;
    if (/value_at_risk/.test(text)) s += Math.min(value / 5000, 0.4);
    if (/^goal=/.test(text)) s = 1;
    return { text, salience: Math.min(1, s) };
  }).sort((a, b) => b.salience - a.salience).slice(0, 8);
}

function basalGanglia(candidates: Candidate[], mode: Mode) {
  const mutating = (t: string) => (BIZ_TOOLS[t] && !BIZ_TOOLS[t].readOnly) || ["db_write", "http_post", "invoke_edge_function"].includes(t);
  const scored = candidates.map((c) => {
    let score = c.utility - c.risk * 0.8 - c.cost * 0.3;
    if (mode === "safe" && mutating(c.tool)) score -= 1;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return { winner: scored[0]?.c ?? null, scores: scored.map((s) => ({ tool: s.c.tool, score: Number(s.score.toFixed(3)) })) };
}

function cerebellum(prediction: string, outcome: unknown): string {
  const text = JSON.stringify(outcome ?? {}).slice(0, 400).toLowerCase();
  const failed = /"ok":false|error|blocked|denied|4\d\d|5\d\d/.test(text);
  if (!failed) return "";
  return `predicted "${prediction.slice(0, 90)}" but got ${text.slice(0, 120)}`;
}

export async function runBrain7Turn(
  agent: AoAgent,
  mission: Mission,
  goal: string,
  policies: Record<string, any>,
  mode: Mode,
): Promise<LobeTurn> {
  const signals = thalamus(mission, goal);
  const attention = amygdala(signals, mission);

  const { data: recent } = await sb().from("ao_dialogue")
    .select("from_agent,lobe,content,kind").eq("mission_id", mission.id)
    .order("created_at", { ascending: false }).limit(8);
  const episodic = (recent ?? []).reverse().map((r) => `- ${r.from_agent}/${r.lobe ?? r.kind}: ${r.content}`).join("\n").slice(0, 2000);
  const { data: errs } = await sb().from("ao_dialogue")
    .select("content").eq("mission_id", mission.id).eq("kind", "prediction_error")
    .order("created_at", { ascending: false }).limit(3);
  const deltas = (errs ?? []).map((e) => e.content).join(" | ") || "(no prediction errors yet)";

  // ---- 3. PREFRONTAL CORTEX: hold the goal, emit candidates with predictions
  const pfcSys = [
    `You are the PREFRONTAL CORTEX of "${agent.display_name}" (${agent.department}) — a Brain-7 agent built on the dual-lobe base.`,
    `CHARTER: ${agent.charter}`,
    agent.strategist_prompt,
    policyBlock(policies),
    `STAGE GOAL: ${goal}`,
    toolCatalog(agent.tools),
    `Mode: ${mode} — mutating/spending capabilities are blocked in safe mode.`,
    "You do NOT execute. Basal ganglia selects one candidate; the motor region runs it; cerebellum scores your prediction.",
    "",
    'Emit ONE JSON object: {"goal_progress":"one sentence","note":"one-line rationale","escalate":{"reason":"..."}|null,"stage_complete":false,',
    ' "candidates":[{"tool":"name","args":{},"why":"","expected":"what you predict happens","utility":0..1,"risk":0..1,"cost":0..1}]}',
    "Max 3 candidates. Never repeat a candidate that already failed twice for the same reason.",
  ].join("\n");

  const pfcRaw = await llm(pfcSys, [{
    role: "user",
    content: [
      `MISSION: ${JSON.stringify({ id: mission.id, title: mission.title, payload: mission.payload }).slice(0, 2000)}`,
      `ATTENTION WINDOW (thalamus → amygdala, salience-ranked):\n${attention.map((a) => `- (${a.salience.toFixed(2)}) ${a.text}`).join("\n")}`,
      `EPISODIC MEMORY (hippocampus):\n${episodic || "(empty)"}`,
      `CEREBELLUM FEEDBACK:\n${deltas}`,
    ].join("\n\n"),
  }], agent.model, { max_tokens: 800 });
  const pfc = safeParse(pfcRaw);
  const plan: string = pfc.goal_progress ?? pfc.note ?? pfc.say ?? "(no plan)";
  await log(mission.id, agent.agent_key, plan, { lobe: "prefrontal", kind: "plan", meta: { note: pfc.note ?? null } });

  if (pfc.escalate?.reason) {
    return { agent: agent.agent_key, plan, report: "Escalated by prefrontal cortex.", advanceStage: false, escalate: { reason: String(pfc.escalate.reason) } };
  }

  const candidates: Candidate[] = (Array.isArray(pfc.candidates) ? pfc.candidates : []).slice(0, 3)
    .map((c: any) => ({
      tool: String(c.tool ?? ""), args: c.args ?? {},
      why: String(c.why ?? "").slice(0, 200), expected: String(c.expected ?? "").slice(0, 200),
      utility: clamp01(c.utility, 0.5), risk: clamp01(c.risk, 0.3), cost: clamp01(c.cost, 0.2),
    })).filter((c: Candidate) => c.tool);

  // ---- 4. BASAL GANGLIA: deterministic gate
  const { winner, scores } = basalGanglia(candidates, mode);
  if (candidates.length) {
    await log(mission.id, agent.agent_key, `gate → ${winner?.tool ?? "none"} ${JSON.stringify(scores)}`, { lobe: "basal_ganglia", kind: "select" });
  }

  // ---- 5. MOTOR: execute exactly one action
  let toolResult: unknown = null;
  const action = winner ? { name: winner.tool, args: winner.args } : null;
  if (action) {
    toolResult = (await runBizTool(action.name, action.args ?? {}, mode))
      ?? (await execTool(action.name, action.args ?? {}, agent.tools, mode));
    await log(mission.id, agent.agent_key, `${action.name}(${JSON.stringify(action.args ?? {}).slice(0, 300)})`, {
      lobe: "motor", kind: "tool", meta: { result: JSON.stringify(toolResult).slice(0, 1500) },
    });
  }

  // ---- 6. CEREBELLUM: prediction error
  const delta = winner ? cerebellum(winner.expected, toolResult) : "";
  if (delta) await log(mission.id, agent.agent_key, delta, { lobe: "cerebellum", kind: "prediction_error" });

  // ---- 7. HIPPOCAMPUS: consolidate into a report + mission patch
  const hippoSys = [
    `You are the HIPPOCAMPUS + reporting region of "${agent.display_name}".`,
    agent.executor_prompt,
    policyBlock(policies),
    `STAGE GOAL: ${goal}`,
    "",
    'Emit ONE JSON object: {"report":"what is now true, with evidence","mission_patch":{},"stage_complete":boolean,"handoff":"agent_key or null"}',
    "mission_patch may set: payload (merged object), expected_value, realized_value, customer_name, customer_email, outcome.",
    "Facts only. If the prediction error says the route is blocked, say so and propose the handoff instead of retrying.",
  ].join("\n");
  const hippoRaw = await llm(hippoSys, [{
    role: "user",
    content: `PLAN: ${plan}\nACTION: ${action ? action.name : "(none)"}\nRESULT: ${JSON.stringify(toolResult ?? null).slice(0, 2000)}\nPREDICTION ERROR: ${delta || "(none)"}`,
  }], agent.model, { max_tokens: 700 });
  const hippo = safeParse(hippoRaw);
  const report: string = hippo.report ?? hippo.say ?? "(no report)";
  await log(mission.id, agent.agent_key, report, { lobe: "hippocampus", kind: "report" });

  const patch = hippo.mission_patch ?? {};
  const update: Record<string, unknown> = {};
  if (patch.payload && typeof patch.payload === "object") update.payload = { ...(mission.payload ?? {}), ...patch.payload };
  for (const k of ["expected_value", "realized_value", "customer_name", "customer_email", "outcome"]) {
    if (patch[k] !== undefined && patch[k] !== null) update[k] = patch[k];
  }
  if (Object.keys(update).length) await sb().from("ao_missions").update(update).eq("id", mission.id);

  return {
    agent: agent.agent_key,
    plan,
    action,
    toolResult,
    report,
    handoff: hippo.handoff ?? null,
    advanceStage: Boolean(hippo.stage_complete ?? pfc.stage_complete),
  };
}

/** Base = dual-lobe. Brain-7 is an additive layer selected per agent. */
export async function runAgentTurn(
  agent: AoAgent,
  mission: Mission,
  goal: string,
  policies: Record<string, any>,
  mode: Mode,
): Promise<LobeTurn> {
  const brain7 = Boolean((agent.addons ?? {})["brain7"]);
  return brain7
    ? await runBrain7Turn(agent, mission, goal, policies, mode)
    : await runDualLobeTurn(agent, mission, goal, policies, mode);
}

