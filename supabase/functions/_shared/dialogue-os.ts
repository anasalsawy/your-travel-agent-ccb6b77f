// Dialogue OS — the governance layer every autonomous agent runs under.
// It is deliberately vendor-neutral: an agent is a (strategist, executor) pair
// plus a charter, a toolset, and a policy envelope. Nothing here knows about
// travel specifically — the domain lives in the seeded agent charters.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { llm, safeParse, execTool, type Mode } from "./lobe-runtime.ts";

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

export async function log(
  missionId: string | null,
  from: string,
  content: string,
  opts: { to?: string; lobe?: string; kind?: string; meta?: Record<string, unknown> } = {},
) {
  await sb().from("ao_dialogue").insert({
    mission_id: missionId,
    from_agent: from,
    to_agent: opts.to ?? null,
    lobe: opts.lobe ?? null,
    kind: opts.kind ?? "say",
    content: content.slice(0, 4000),
    meta: opts.meta ?? {},
  });
}

export async function event(
  missionId: string | null,
  agentKey: string | null,
  type: string,
  summary: string,
  detail: Record<string, unknown> = {},
) {
  await sb().from("ao_events").insert({
    mission_id: missionId, agent_key: agentKey, event_type: type, summary: summary.slice(0, 500), detail,
  });
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
};

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
    toolResult = await execTool(action.name, action.args ?? {}, agent.tools, mode);
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
