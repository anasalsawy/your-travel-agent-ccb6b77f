// War Room — a single live coordination room where the Chief of Staff (leader)
// orchestrates all main agents. Everyone speaks in this one channel.
//
// Actions (POST body: { action, ... }):
//   post        { agent_name, content, role?, addressed_to? }   -> insert a message (user or agent)
//   tick        {}                                              -> Chief of Staff runs one coordination cycle
//   assign      { title, description?, assignee, priority? }    -> create task manually
//   task_update { id, status?, result? }                        -> mark task progress
//   heartbeat   { agent_name, status_line, current_task_id?, mood? }
//
// tick() is the brain: reads recent transcript + open tasks + heartbeats,
// asks Gemini (via Lovable AI Gateway) to speak as the Chief of Staff,
// then rotates to one specialist agent for their reply.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SVC);

// ---------- Roster (main agents only; keep tight) ----------
const CHIEF = "chief-of-staff";
const INFRA_AUTHORITY = "internal-app-test-buildrunner";
type AgentDef = { name: string; display: string; role: string; specialty: string };
const ROSTER: AgentDef[] = [
  { name: CHIEF,               display: "Chief of Staff",     role: "leader",   specialty: "Coordinates the room. Assigns tasks by specialty. Demands heartbeats. Pings idle agents. Synthesizes and closes work." },
  { name: "assistant",         display: "Concierge",          role: "customer", specialty: "Front-desk / customer voice. Quotes, checkout links, first-line answers." },
  { name: "YTA-ASSISTANT",     display: "Booking Delegate",   role: "booking",  specialty: "Autonomous flight/hotel/car booking, changes, cancels, reservation lookup." },
  { name: "BUILDEROFAGENTS",   display: "Master Builder",     role: "builder",  specialty: "Spawns/edits agents, plans code + infra work, orchestrates the builder helpers." },
  { name: INFRA_AUTHORITY,     display: "Infrastructure Authority", role: "infra", specialty: "High-authority Azure AI Developer. Owns infra/resource edits, deployment unblock, and final escalation decisions." },
  { name: "shopper-lead",      display: "Shopper Chief",      role: "shopper",  specialty: "Runs shopping missions: research→plan→tactics→execute→verify with 3 helpers." },
  { name: "shopper-helper-1",  display: "Research Analyst",   role: "shopper",  specialty: "Retailer matrix, price/stock/friction recon." },
  { name: "shopper-helper-2",  display: "Tactical Operator",  role: "shopper",  specialty: "Cart prep, anti-bot, captcha, auth pivots." },
  { name: "shopper-helper-3",  display: "Field Buyer",        role: "shopper",  specialty: "Atomic checkouts. One purchase per turn." },
];
const SPECIALISTS = ROSTER.filter((a) => a.name !== CHIEF);
const STALE_SECS = 90;
const RETRY_ATTEMPTS = 3;
const COACH_LOOP_ROUNDS = 3;
const ESCALATE_AFTER_ERRORS = 2;
const ERROR_WINDOW_MS = 20 * 60 * 1000;
const CHILD_TTL_MINUTES = 20;
const EPHEMERAL_PARENT_AGENTS = new Set(["BUILDEROFAGENTS", "shopper-lead", "YTA-ASSISTANT", "assistant"]);
const PLANNER_TIMEOUT_MS = 12000;
const SPECIALIST_TIMEOUT_MS = 18000;

// ---------- Helpers ----------
function parsePlanJson(raw: string): any {
  const txt = String(raw ?? "").trim();
  if (!txt) return {};
  try { return JSON.parse(txt); } catch { /* continue */ }
  const fenced = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced); } catch { /* continue */ }
  }
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(txt.slice(first, last + 1)); } catch { /* continue */ }
  }
  return {};
}

async function planFromAuthority(system: string, user: string) {
  try {
    const r = await fetch(SB_URL + "/functions/v1/foundry-agent-run", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
      body: JSON.stringify({
        agentName: INFRA_AUTHORITY,
        channel: "war-room",
        externalId: "war-room",
        source: "chief-planner",
        message: [
          "[SYSTEM]",
          system,
          "",
          "[TASK]",
          user,
          "",
          "Respond with JSON only. Do not call tools for this planner turn.",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(PLANNER_TIMEOUT_MS),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) {
      throw new Error(String(j?.error ?? ("planner_http_" + r.status)));
    }
    return parsePlanJson(String(j?.text ?? ""));
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    throw new Error(msg.includes("aborted") || msg.includes("timeout") ? "planner_timeout" : msg);
  }
}

async function postMessage(agent_name: string, content: string, role = "assistant", addressed_to: string[] = [], meta: Record<string, unknown> = {}) {
  await sb.from("war_room_messages").insert({ agent_name, role, content, addressed_to, meta });
  await sb.from("war_room_heartbeats").upsert({
    agent_name, status_line: content.slice(0, 120), last_beat_at: new Date().toISOString(),
  });
}

async function loadContext() {
  const [msgs, tasks, hbs] = await Promise.all([
    sb.from("war_room_messages").select("*").order("created_at", { ascending: false }).limit(30),
    sb.from("war_room_tasks").select("*").in("status", ["todo", "doing"]).order("priority").order("created_at"),
    sb.from("war_room_heartbeats").select("*"),
  ]);
  return {
    transcript: (msgs.data ?? []).reverse(),
    tasks: tasks.data ?? [],
    heartbeats: hbs.data ?? [],
  };
}

function transcriptText(rows: any[]): string {
  return rows.map((m) => {
    const to = m.addressed_to?.length ? " →" + m.addressed_to.join(",") : "";
    return "[" + m.agent_name + to + "] " + String(m.content).slice(0, 400);
  }).join("\n");
}

function staleAgents(hbs: any[]): string[] {
  const now = Date.now();
  const seen = new Map(hbs.map((h) => [h.agent_name, new Date(h.last_beat_at).getTime()]));
  return SPECIALISTS
    .filter((a) => !seen.has(a.name) || (now - (seen.get(a.name) ?? 0)) / 1000 > STALE_SECS)
    .map((a) => a.name);
}

function resolveSpeaker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  const byName = SPECIALISTS.find((s) => s.name.toLowerCase() === v.toLowerCase());
  if (byName) return byName.name;
  const byDisplay = SPECIALISTS.find((s) => s.display.toLowerCase() === v.toLowerCase());
  if (byDisplay) return byDisplay.name;
  return null;
}

function fallbackSpeaker(stale: string[], tasks: any[]): string {
  const stalePick = stale.find((name) => !!resolveSpeaker(name));
  if (stalePick) return resolveSpeaker(stalePick)!;
  const openTaskAssignee = tasks.find((t) => t?.status !== "done" && resolveSpeaker(t?.assignee))?.assignee;
  if (openTaskAssignee) return resolveSpeaker(openTaskAssignee)!;
  return "YTA-ASSISTANT";
}

function shouldInvokeSpecialist(nextName: string | null, lastMsg: any): boolean {
  if (!nextName) return false;
  if (!lastMsg) return true;
  if (lastMsg.agent_name !== nextName) return true;
  if (lastMsg.role === "error") return true;
  const ts = new Date(lastMsg.created_at ?? 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return true;
  const ageSec = (Date.now() - ts) / 1000;
  // Retry same-agent turns when the previous message is old enough.
  return ageSec > 45;
}

function countRecentAgentErrors(transcript: any[], agentName: string): number {
  const now = Date.now();
  return transcript.filter((m) => {
    if (m?.agent_name !== agentName) return false;
    const ts = new Date(m?.created_at ?? 0).getTime();
    if (!Number.isFinite(ts) || now - ts > ERROR_WINDOW_MS) return false;
    const text = String(m?.content ?? "").toLowerCase();
    return m?.role === "error" || /blocked|no response|tool_user_error|azure 4\d\d|azure 5\d\d|runtime error/.test(text);
  }).length;
}

function isReadinessLoopText(v: string): boolean {
  const t = String(v ?? "").toLowerCase();
  if (!t) return false;
  return /readiness|heartbeat sweep|roster heartbeat|capability sweep|room is cold|stale agents|reactivation/.test(t);
}

function countRecentChiefReadinessLoops(transcript: any[]): number {
  const recent = transcript.slice(-10);
  return recent.filter((m) => {
    if (m?.agent_name !== CHIEF) return false;
    return isReadinessLoopText(String(m?.content ?? ""));
  }).length;
}

function countRecentDirectiveRepeats(transcript: any[], directive: string): number {
  const d = String(directive ?? "").trim().toLowerCase();
  if (!d) return 0;
  return transcript.slice(-20).filter((m) => {
    if (m?.agent_name !== CHIEF) return false;
    const md = String(m?.meta?.directive ?? "").trim().toLowerCase();
    return md && md === d;
  }).length;
}

function directivePhase(directive: string, speech: string, nextSpeaker: string | null): "planning" | "readiness" | "execution" | "escalation" {
  const d = (directive + " " + speech).toLowerCase();
  if (nextSpeaker === INFRA_AUTHORITY || /escalat|take over|authority/.test(d)) return "escalation";
  if (/readiness|heartbeat|stale|roll call|reactivation|status board|capability sweep/.test(d)) return "readiness";
  if (/execute|launch|book|shopping|build|mission|checkout|implementation|task lane/.test(d)) return "execution";
  return "planning";
}

function retryMessage(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  if (attempt === 2) {
    return base + "\n\nRETRY MODE A: keep it minimal. Post ACK via war_room_post first, then execute one smallest next tool step.";
  }
  return base + "\n\nRETRY MODE B: choose a different path/tool than prior attempts. If still blocked, post evidence + exact blocker + next fallback.";
}

type AgentRun = { ok: boolean; posted: boolean; finalText: string; steps: any[]; error: string | null; status: number };
async function runSpecialist(agentName: string, message: string, source: string): Promise<AgentRun> {
  try {
    const r = await fetch(SB_URL + "/functions/v1/foundry-agent-run", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
      body: JSON.stringify({ agentName, channel: "war-room", externalId: "war-room", message, source }),
      signal: AbortSignal.timeout(SPECIALIST_TIMEOUT_MS),
    });
    const jr = await r.json().catch(() => ({}));
    const finalText = String(jr?.text ?? "").trim();
    const steps = Array.isArray(jr?.steps) ? jr.steps : [];
    const posted = steps.some((s: any) => s?.tool === "war_room_post");
    const ok = r.ok && jr?.ok !== false && (posted || !!finalText);
    const error = ok ? null : String(jr?.error ?? ("http_" + r.status));
    return { ok, posted, finalText, steps, error, status: r.status };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    const err = msg.includes("aborted") || msg.includes("timeout") ? "specialist_timeout" : msg;
    return { ok: false, posted: false, finalText: "", steps: [], error: err, status: 599 };
  }
}

type TaskTeamSpec = {
  role: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  restrictions: string[];
  min_tools: string[];
  interfaces: string[];
  completion_criteria: string[];
};
type PlannedCapabilityAction = {
  kind: "tool" | "infra";
  action: "create" | "configure" | "reuse" | "retire";
  name: string;
  owner: string;
  purpose: string;
  temporary: boolean;
  risk: "low" | "medium" | "high";
  requires_approval: boolean;
};
type ChildSession = { id: string; parent: string; created_at: string; expires_at: string; spec: TaskTeamSpec };
type ExecutionOutcome = { out: AgentRun | null; via: "direct" | "ephemeral-child"; child?: ChildSession; coach?: string };
type ManagerStage = "PLAN" | "CREATE_CHILD" | "DELEGATE" | "SUPERVISE" | "VERIFY" | "CLEANUP" | "DONE" | "ESCALATE";

function shouldUseEphemeralChild(agentName: string): boolean {
  return EPHEMERAL_PARENT_AGENTS.has(agentName);
}

function makeChildId(parent: string): string {
  const slug = parent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 20) || "worker";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return "wr-child-" + slug + "-" + stamp + "-" + rand;
}

function deriveTaskSpec(parent: string, directive: string): TaskTeamSpec {
  const lower = directive.toLowerCase();
  let role = "Execution Specialist";
  let minTools = ["war_room_post"];
  let inputs = ["Chief directive", "Recent room context"];
  let outputs = ["Status update", "Evidence of one concrete step"];
  const restrictions = [
    "Do not expand scope without lead approval.",
    "Do not perform destructive infra actions without authority approval.",
    "Prefer minimum viable next step over broad speculative work.",
  ];
  if (lower.includes("book") || lower.includes("flight") || lower.includes("hotel")) role = "Booking Execution Specialist";
  else if (lower.includes("shop")) role = "Shopping Execution Specialist";
  else if (lower.includes("build") || lower.includes("deploy") || lower.includes("fix")) role = "Engineering Execution Specialist";
  if (lower.includes("book") || lower.includes("flight")) {
    minTools = ["war_room_post", "duffel_search", "duffel_offer", "duffel_create_checkout"];
    inputs.push("Passenger/search constraints");
    outputs.push("Offer shortlist with price evidence", "Provider checkout path");
  } else if (lower.includes("build") || lower.includes("deploy")) {
    minTools = ["war_room_post", "azure_deploy_function", "azure_get_logs", "azure_patch_agent"];
    inputs.push("Code and deployment target");
    outputs.push("Patch/deploy report", "Rollback notes");
  }
  const objective = directive.slice(0, 280);
  return {
    role,
    objective,
    inputs,
    outputs,
    restrictions,
    min_tools: minTools,
    interfaces: [parent, CHIEF, INFRA_AUTHORITY],
    completion_criteria: [
      "Post ACK status with first concrete step.",
      "Execute at least one real tool/action step with evidence.",
      "If blocked, post blocker evidence plus fallback.",
      "End with DONE/READY_FOR_PAYMENT/ASKING status and next action.",
    ],
  };
}

function buildChildPrompt(child: ChildSession, baseMessage: string, attempt: number): string {
  const cc = child.spec.completion_criteria.map((c, i) => (i + 1) + ") " + c).join("\n");
  const io = [
    "inputs: " + child.spec.inputs.join(" | "),
    "outputs: " + child.spec.outputs.join(" | "),
    "restrictions: " + child.spec.restrictions.join(" | "),
    "minimum_tools: " + child.spec.min_tools.join(", "),
  ].join("\n");
  return [
    "[EPHEMERAL CHILD WORKER]",
    "child_id: " + child.id,
    "parent_agent: " + child.parent,
    "worker_role: " + child.spec.role,
    "objective: " + child.spec.objective,
    "interfaces_with: " + child.spec.interfaces.join(", "),
    "attempt: " + attempt + "/" + RETRY_ATTEMPTS,
    "ttl_minutes: " + CHILD_TTL_MINUTES,
    "",
    "Completion criteria:",
    cc,
    "",
    "Task contract:",
    io,
    "",
    "Delegation rule: You are a disposable worker. Do not expand scope. If you need sub-specialists, request lead approval first.",
    "",
    baseMessage,
  ].join("\n");
}

async function spawnChildSession(parent: string, directive: string, spec: TaskTeamSpec): Promise<ChildSession> {
  const created = new Date();
  const expires = new Date(created.getTime() + CHILD_TTL_MINUTES * 60 * 1000);
  const child: ChildSession = {
    id: makeChildId(parent),
    parent,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
    spec,
  };
  await postMessage(
    CHIEF,
    "Spawned ephemeral worker " + child.id + " under " + parent + " as " + spec.role + ".",
    "assistant",
    [parent],
    { via: "child-spawn", child_id: child.id, ttl_minutes: CHILD_TTL_MINUTES, role: spec.role, objective: spec.objective, directive: directive.slice(0, 220) },
  );
  return child;
}

async function closeChildSession(child: ChildSession, outcome: "done" | "failed", details: string, addressed_to: string[] = []): Promise<void> {
  await postMessage(
    CHIEF,
    "Closed ephemeral worker " + child.id + " (" + outcome + "). " + details.slice(0, 220),
    "assistant",
    addressed_to,
    { via: "child-close", child_id: child.id, outcome, parent: child.parent },
  );
}

function childExpired(child: ChildSession): boolean {
  const exp = new Date(child.expires_at).getTime();
  return Number.isFinite(exp) && Date.now() > exp;
}

async function postManagerStage(
  lead: string,
  stage: ManagerStage,
  child: ChildSession | null,
  details: string,
  addressed_to: string[] = [],
  meta: Record<string, unknown> = {},
): Promise<void> {
  await postMessage(
    CHIEF,
    "[MANAGER:" + stage + "] " + lead + (child?.id ? " child=" + child.id : "") + " — " + details.slice(0, 260),
    "assistant",
    addressed_to,
    {
      via: "manager-state",
      manager_stage: stage,
      lead,
      child_id: child?.id ?? null,
      child_expires_at: child?.expires_at ?? null,
      retry_policy: { attempts: RETRY_ATTEMPTS, coach_rounds: COACH_LOOP_ROUNDS, ttl_minutes: CHILD_TTL_MINUTES },
      ...meta,
    },
  );
}

async function createLifecycleTask(parent: string, child: ChildSession, directive: string): Promise<string | null> {
  const { data, error } = await sb.from("war_room_tasks").insert({
    title: "Lifecycle " + child.id + " (" + parent + ")",
    description: "Manager pipeline: PLAN->CREATE_CHILD->DELEGATE->SUPERVISE->VERIFY->CLEANUP->DONE. Role: " + child.spec.role + ". Objective: " + directive.slice(0, 220),
    assignee: parent,
    priority: 2,
    status: "doing",
    created_by: CHIEF,
  }).select("id").single();
  if (error) {
    await postManagerStage(parent, "PLAN", child, "Lifecycle task insert failed (non-fatal).", [parent], { task_error: error.message });
    return null;
  }
  return data?.id ?? null;
}

async function closeLifecycleTask(taskId: string | null, outcome: "done" | "failed", result: string): Promise<void> {
  if (!taskId) return;
  await sb.from("war_room_tasks").update({ status: "done", result: "[" + outcome.toUpperCase() + "] " + result.slice(0, 800) }).eq("id", taskId);
}

async function createEscalationTask(failingAgent: string, details: string): Promise<void> {
  await sb.from("war_room_tasks").insert({
    title: "Escalation: recover " + failingAgent,
    description: details.slice(0, 800),
    assignee: INFRA_AUTHORITY,
    priority: 1,
    created_by: CHIEF,
  });
}

async function verifyByAuthority(parentAgent: string, child: ChildSession, workerOut: AgentRun): Promise<{ ok: boolean; notes: string }> {
  const verificationPrompt = [
    "[INDEPENDENT VERIFICATION REQUEST]",
    "Lead agent: " + parentAgent,
    "Worker child_id: " + child.id,
    "Worker role: " + child.spec.role,
    "Objective: " + child.spec.objective,
    "",
    "Worker output excerpt:",
    (workerOut.finalText || "(empty)").slice(0, 1200),
    "",
    "Verify against completion criteria:",
    child.spec.completion_criteria.map((c, i) => (i + 1) + ") " + c).join("\n"),
    "",
    "Respond with PASS or FAIL in your first line, then one short reason and one next action.",
  ].join("\n");
  const vr = await runSpecialist(INFRA_AUTHORITY, verificationPrompt, "cron-verify-" + child.id);
  const txt = (vr.finalText || "").trim();
  const pass = vr.ok && /^pass\b/i.test(txt);
  return { ok: pass, notes: txt.slice(0, 300) || String(vr.error ?? "verification-empty") };
}

function normalizePlannedActions(raw: unknown, kind: "tool" | "infra"): PlannedCapabilityAction[] {
  if (!Array.isArray(raw)) return [];
  const out: PlannedCapabilityAction[] = [];
  for (const item of raw) {
    const action = String((item as any)?.action ?? "").toLowerCase();
    const normalizedAction = action === "create" || action === "configure" || action === "reuse" || action === "retire"
      ? action as PlannedCapabilityAction["action"]
      : null;
    if (!normalizedAction) continue;
    const name = String((item as any)?.name ?? "").trim();
    if (!name) continue;
    const ownerRaw = String((item as any)?.owner ?? "").trim();
    const owner = resolveSpeaker(ownerRaw) ?? (kind === "infra" ? INFRA_AUTHORITY : CHIEF);
    const riskRaw = String((item as any)?.risk ?? "medium").toLowerCase();
    const risk: PlannedCapabilityAction["risk"] =
      riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : "medium";
    const purpose = String((item as any)?.purpose ?? "").trim() || "No purpose provided.";
    const temporary = Boolean((item as any)?.temporary ?? true);
    const requiresApproval = Boolean((item as any)?.requires_approval ?? (kind === "infra" || risk === "high"));
    out.push({
      kind,
      action: normalizedAction,
      name,
      owner,
      purpose: purpose.slice(0, 300),
      temporary,
      risk,
      requires_approval: requiresApproval,
    });
  }
  return out;
}

async function enqueueCapabilityActions(actions: PlannedCapabilityAction[]): Promise<void> {
  for (const a of actions) {
    const mustRouteAuthority = a.kind === "infra" && (a.requires_approval || a.risk === "high");
    const assignee = mustRouteAuthority ? INFRA_AUTHORITY : a.owner;
    await sb.from("war_room_tasks").insert({
      title: `${a.kind.toUpperCase()} ${a.action}: ${a.name}`,
      description: `Purpose: ${a.purpose}. Temporary: ${a.temporary}. Risk: ${a.risk}. Approval: ${a.requires_approval}.`,
      assignee,
      priority: mustRouteAuthority ? 1 : 2,
      created_by: CHIEF,
    });
    const msg = mustRouteAuthority
      ? `Approval required for ${a.kind} action ${a.action} on ${a.name}. ${INFRA_AUTHORITY}, review with lead before execution.`
      : `Planned ${a.kind} action ${a.action} on ${a.name} assigned to ${assignee}.`;
    await postMessage(CHIEF, msg, "assistant", [assignee], {
      via: "capability-plan",
      capability_kind: a.kind,
      capability_action: a.action,
      capability_name: a.name,
      temporary: a.temporary,
      risk: a.risk,
      requires_approval: a.requires_approval,
    });
  }
}

async function runDirectWithRecovery(agentName: string, baseMessage: string, transcript: any[]): Promise<ExecutionOutcome> {
  let out: AgentRun | null = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    out = await runSpecialist(agentName, retryMessage(baseMessage, attempt), attempt === 1 ? "cron-tick" : ("cron-tick-retry-" + attempt));
    if (out.ok) return { out, via: "direct" };
  }
  const firstErr = (out?.error ?? "empty").toString();
  const loop = await runCoachLoop(agentName, baseMessage, transcript, firstErr);
  return { out: loop.out, via: "direct", coach: loop.coach };
}

async function runWithEphemeralChildLifecycle(parentAgent: string, baseMessage: string, transcript: any[]): Promise<ExecutionOutcome> {
  await postManagerStage(parentAgent, "PLAN", null, "Preparing delegated execution pipeline.", [parentAgent]);
  const spec = deriveTaskSpec(parentAgent, baseMessage);
  const child = await spawnChildSession(parentAgent, baseMessage, spec);
  await postManagerStage(parentAgent, "CREATE_CHILD", child, "Ephemeral child created with TTL enforcement.", [parentAgent]);
  const lifecycleTaskId = await createLifecycleTask(parentAgent, child, baseMessage);
  let out: AgentRun | null = null;
  let childClosed = false;

  try {
    await postManagerStage(parentAgent, "DELEGATE", child, "Delegating directive to child-run attempts.", [parentAgent]);
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      if (childExpired(child)) {
        await postManagerStage(parentAgent, "SUPERVISE", child, "TTL expired before attempt " + attempt + ". Forcing cleanup and escalation.", [INFRA_AUTHORITY, parentAgent], { attempt });
        await postManagerStage(parentAgent, "VERIFY", child, "Verification failed: child TTL expired before completion.", [INFRA_AUTHORITY, parentAgent], { attempt, reason: "ttl_expired" });
        await closeChildSession(child, "failed", "TTL expired before completion.", [INFRA_AUTHORITY, parentAgent]);
        childClosed = true;
        await postManagerStage(parentAgent, "CLEANUP", child, "Child session closed after TTL expiry.", [INFRA_AUTHORITY, parentAgent], { attempt, task_id: lifecycleTaskId });
        await closeLifecycleTask(lifecycleTaskId, "failed", "TTL expired before completion; escalated.");
        await createEscalationTask(parentAgent, "Lifecycle TTL expired for child " + child.id + ". Infra authority intervention required.");
        await postManagerStage(parentAgent, "ESCALATE", child, "Escalated due to TTL expiry.", [INFRA_AUTHORITY, parentAgent], { reason: "ttl_expired" });
        return { out: null, via: "ephemeral-child", child };
      }
      const childPrompt = buildChildPrompt(child, retryMessage(baseMessage, attempt), attempt);
      out = await runSpecialist(parentAgent, childPrompt, "cron-child-" + attempt);
      await postManagerStage(
        parentAgent,
        "SUPERVISE",
        child,
        out.ok
          ? "Attempt " + attempt + " succeeded."
          : "Attempt " + attempt + " failed (" + String(out.error ?? "unknown").slice(0, 120) + ").",
        [parentAgent],
        { attempt, outcome_ok: out.ok, http_status: out.status, error: out.error ?? null },
      );
      if (out.ok) {
        const verifier = await verifyByAuthority(parentAgent, child, out);
        if (!verifier.ok) {
          await postManagerStage(parentAgent, "VERIFY", child, "Independent verification failed on attempt " + attempt + ".", [INFRA_AUTHORITY, parentAgent], { attempt, verifier_notes: verifier.notes });
          out = { ...out, ok: false, error: "verification_failed: " + verifier.notes };
          continue;
        }
        await postManagerStage(parentAgent, "VERIFY", child, "Output independently verified after attempt " + attempt + ".", [parentAgent, CHIEF], { attempt, verifier: INFRA_AUTHORITY });
        await closeChildSession(child, "done", "Completed during retry window.", [parentAgent, CHIEF]);
        childClosed = true;
        await postManagerStage(parentAgent, "CLEANUP", child, "Child session closed after successful verification.", [parentAgent, CHIEF], { task_id: lifecycleTaskId });
        await closeLifecycleTask(lifecycleTaskId, "done", "Recovered in " + attempt + " attempt(s).");
        await postManagerStage(parentAgent, "DONE", child, "Delegated execution completed.", [parentAgent, CHIEF], { task_id: lifecycleTaskId });
        return { out, via: "ephemeral-child", child };
      }
    }

    const firstErr = (out?.error ?? "empty").toString();
    const coachedBase = buildChildPrompt(child, baseMessage, RETRY_ATTEMPTS);
    await postManagerStage(parentAgent, "SUPERVISE", child, "Retry budget exhausted. Entering coach loop.", [parentAgent], { first_error: firstErr.slice(0, 220) });
    const loop = await runCoachLoop(parentAgent, coachedBase, transcript, firstErr);
    if (loop.out?.ok) {
      await postManagerStage(parentAgent, "VERIFY", child, "Coach loop recovered execution via " + loop.coach + ".", [parentAgent, CHIEF], { coach: loop.coach ?? null });
      await closeChildSession(child, "done", "Recovered in coach loop via " + loop.coach + ".", [parentAgent, CHIEF]);
      childClosed = true;
      await postManagerStage(parentAgent, "CLEANUP", child, "Child session closed after coach-loop recovery.", [parentAgent, CHIEF], { coach: loop.coach ?? null, task_id: lifecycleTaskId });
      await closeLifecycleTask(lifecycleTaskId, "done", "Recovered via coach " + (loop.coach ?? "unknown") + ".");
      await postManagerStage(parentAgent, "DONE", child, "Delegated execution completed after recovery.", [parentAgent, CHIEF], { coach: loop.coach ?? null, task_id: lifecycleTaskId });
      return { out: loop.out, via: "ephemeral-child", child, coach: loop.coach };
    }

    await postManagerStage(parentAgent, "VERIFY", child, "Verification failed after retries and coach loop.", [INFRA_AUTHORITY, parentAgent], { coach: loop.coach ?? null });
    await closeChildSession(child, "failed", "Retries and coach loop exhausted. Escalation required.", [INFRA_AUTHORITY, parentAgent]);
    childClosed = true;
    await postManagerStage(parentAgent, "CLEANUP", child, "Child session closed after failure.", [INFRA_AUTHORITY, parentAgent], { coach: loop.coach ?? null, task_id: lifecycleTaskId });
    await closeLifecycleTask(lifecycleTaskId, "failed", "Retries and coach loop exhausted; escalation required.");
    await createEscalationTask(parentAgent, "Lifecycle retries + coach loop exhausted for child " + child.id + ". Last coach: " + (loop.coach ?? "none") + ".");
    await postManagerStage(parentAgent, "ESCALATE", child, "Escalated to infra authority after lifecycle exhaustion.", [INFRA_AUTHORITY, parentAgent], { coach: loop.coach ?? null, task_id: lifecycleTaskId });
    return { out: null, via: "ephemeral-child", child, coach: loop.coach };
  } catch (e) {
    const err = (e as Error).message ?? String(e);
    await postManagerStage(parentAgent, "VERIFY", child, "Lifecycle threw unexpected exception.", [INFRA_AUTHORITY, parentAgent], { error: err.slice(0, 220) });
    if (!childClosed) {
      await closeChildSession(child, "failed", "Lifecycle exception: " + err.slice(0, 180), [INFRA_AUTHORITY, parentAgent]);
      childClosed = true;
    }
    await postManagerStage(parentAgent, "CLEANUP", child, "Child session closed after lifecycle exception.", [INFRA_AUTHORITY, parentAgent], { task_id: lifecycleTaskId, error: err.slice(0, 220) });
    await closeLifecycleTask(lifecycleTaskId, "failed", "Lifecycle exception: " + err.slice(0, 300));
    await createEscalationTask(parentAgent, "Lifecycle exception in delegated run for child " + child.id + ": " + err);
    await postManagerStage(parentAgent, "ESCALATE", child, "Escalated due to lifecycle exception.", [INFRA_AUTHORITY, parentAgent], { error: err.slice(0, 220), task_id: lifecycleTaskId });
    return { out: null, via: "ephemeral-child", child };
  }
}

function pickCoach(stuckAgent: string): string {
  if (stuckAgent === "BUILDEROFAGENTS") return "YTA-ASSISTANT";
  if (stuckAgent === INFRA_AUTHORITY) return "BUILDEROFAGENTS";
  return "BUILDEROFAGENTS";
}

async function runCoachLoop(stuckAgent: string, baseMessage: string, transcript: any[], firstError: string): Promise<{ out: AgentRun | null; coach: string }> {
  const coach = pickCoach(stuckAgent);
  let lastErr = firstError;
  for (let round = 1; round <= COACH_LOOP_ROUNDS; round++) {
    const coachPrompt = [
      "[WAR ROOM STUCK-LOOP COACH REQUEST]",
      "You are coaching " + stuckAgent + " to recover a blocked run.",
      "Round: " + round + "/" + COACH_LOOP_ROUNDS,
      "Last error: " + (lastErr || "unknown"),
      "",
      "Recent transcript (oldest→newest):",
      transcriptText(transcript.slice(-10)) || "(empty)",
      "",
      "Respond with 3-6 concrete steps. Avoid generic advice. Include a fallback path.",
      "Start with: COACH_PLAN:",
    ].join("\n");
    const coachOut = await runSpecialist(coach, coachPrompt, "stuck-loop-coach-" + round);
    const guidance = coachOut.finalText || ("COACH_PLAN: failed to generate plan. Use smallest safe step and post blocker evidence.");
    await postMessage(
      CHIEF,
      "Recovery loop " + round + "/" + COACH_LOOP_ROUNDS + ": " + coach + " coaching " + stuckAgent + ".",
      "assistant",
      [coach, stuckAgent],
      { via: "stuck-loop", round, first_error: firstError.slice(0, 220) },
    );
    const loopPrompt = [
      retryMessage(baseMessage, 3),
      "",
      "[COACH GUIDANCE]",
      guidance.slice(0, 2500),
      "",
      "MANDATORY: Execute one concrete next step now and call war_room_post with result.",
    ].join("\n");
    const out = await runSpecialist(stuckAgent, loopPrompt, "stuck-loop-agent-" + round);
    if (out.ok) return { out, coach };
    lastErr = out.error ?? "unknown";
  }
  return { out: null, coach };
}

// ---------- Chief of Staff cycle ----------
async function tick() {
  const { transcript, tasks, heartbeats } = await loadContext();
  const stale = staleAgents(heartbeats);
  const openTasks = tasks.map((t) => "#" + t.id.slice(0, 8) + " [" + t.status + " p" + t.priority + "] @" + t.assignee + " — " + t.title).join("\n") || "(no open tasks)";
  const rosterList = SPECIALISTS.map((a) => "- " + a.name + " (" + a.display + "): " + a.specialty).join("\n");
  const lastMsg = transcript[transcript.length - 1];

  // 1) Chief speaks — decides action as JSON
  const chiefSystem = [
    "You are the planning brain for CHIEF OF STAFF in a live coordination war room.",
    "Identity: " + INFRA_AUTHORITY + ". You are high-authority Azure AI Developer and escalation lead.",
    "You produce Chief strategy: OBSERVE, DECIDE, ASSIGN, NUDGE.",
    "Do not be a dictator. For major infra policy choices, include consultation note in speech.",
    "Voice: crisp, decisive, one short paragraph max. Address people by name.",
    "",
    "ROSTER (delegate to exactly one of these names):",
    rosterList,
    "",
    "OPEN TASKS:",
    openTasks,
    "",
    "STALE AGENTS (no heartbeat in " + STALE_SECS + "s): " + (stale.join(", ") || "none"),
    "",
    "Reply with JSON only:",
    '{ "speech": "<what Chief says out loud, 1-3 sentences>",',
    '  "next_speaker": "<agent name from roster OR null to wait>",',
    '  "directive": "<one crisp order for that agent>",',
    '  "new_tasks": [{"title":"...","assignee":"<agent>","priority":1-5,"description":"..."}],',
    '  "tool_actions": [{"action":"create|configure|reuse|retire","name":"...","owner":"<agent>","purpose":"...","temporary":true,"risk":"low|medium|high","requires_approval":false}],',
    '  "infra_actions": [{"action":"create|configure|reuse|retire","name":"...","owner":"<agent>","purpose":"...","temporary":true,"risk":"low|medium|high","requires_approval":true}],',
    '  "nudges": ["<agent names to publicly ping for a status heartbeat>"],',
    '  "closed_tasks": ["<task id prefix to mark done, if any>"] }',
  ].join("\n");

  const chiefUser = "Recent transcript (oldest→newest):\n" + (transcriptText(transcript) || "(empty room)") +
    "\n\nWhat is your next move? If the room is quiet, kick off work. If someone is stalling, call them out. If tasks look complete, close them.";

  let plan: any = {};
  try {
    plan = await planFromAuthority(chiefSystem, chiefUser);
    const hasSpeech = typeof plan?.speech === "string" && plan.speech.trim().length > 0;
    const hasSpeaker = typeof plan?.next_speaker === "string" && plan.next_speaker.trim().length > 0;
    if (!hasSpeech && !hasSpeaker) throw new Error("planner returned empty plan");
  } catch (e) {
    const fallback = stale[0] ?? "YTA-ASSISTANT";
    plan = {
      speech: "Planner degraded: " + (e as Error).message.slice(0, 120) + ". " + fallback + ", post ACK and continue with next concrete action.",
      next_speaker: fallback,
      directive: "Recover flow and post concrete progress.",
      new_tasks: [],
      nudges: stale.slice(0, 2),
      closed_tasks: [],
    };
  }

  // Normalize planner output so malformed/partial plans cannot stall delegation.
  const resolvedSpeaker = resolveSpeaker(plan?.next_speaker);
  const needsAction =
    stale.length > 0 ||
    tasks.some((t) => t?.status !== "done") ||
    (lastMsg && ["user", "error"].includes(String(lastMsg.role ?? "").toLowerCase()));
  if (!resolvedSpeaker && needsAction) {
    const pick = fallbackSpeaker(stale, tasks);
    const priorSpeech = typeof plan?.speech === "string" ? plan.speech.trim() : "";
    plan.next_speaker = pick;
    plan.directive = String(plan?.directive ?? "").trim() || "Post ACK, execute one concrete step, and report progress with evidence.";
    plan.speech = priorSpeech
      ? priorSpeech + " " + pick + ", take immediate action and post a status update."
      : pick + ", take immediate action and post a status update.";
  } else {
    plan.next_speaker = resolvedSpeaker ?? null;
    if (resolvedSpeaker && !String(plan?.directive ?? "").trim()) {
      plan.directive = String(plan?.speech ?? "Post ACK, execute one concrete step, and report back.");
    }
  }

  // Anti-stall: if Chief keeps repeating readiness sweeps, force execution-mode routing.
  const readinessLoopCount = countRecentChiefReadinessLoops(transcript);
  const currentDirective = String(plan?.directive ?? "");
  if (
    readinessLoopCount >= 2 &&
    resolveSpeaker(plan?.next_speaker) === "BUILDEROFAGENTS" &&
    isReadinessLoopText(currentDirective)
  ) {
    plan.next_speaker = "YTA-ASSISTANT";
    plan.directive =
      "Start real execution now: launch booking lane with concrete first step and blocker report. " +
      "In parallel, request shopper-lead to start shopping lane and BUILDEROFAGENTS to open Task1 build lane. " +
      "Post progress updates, not readiness sweeps.";
    plan.speech =
      "Readiness baseline is sufficient. We are now in execution mode. " +
      "YTA-ASSISTANT, open booking lane now and trigger parallel shopping/build lanes with immediate progress updates.";
    plan.nudges = ["shopper-lead", "BUILDEROFAGENTS"];
  }

  // Escalate automatically if the same directive repeats more than 2 times.
  const directiveRepeats = countRecentDirectiveRepeats(transcript, String(plan?.directive ?? ""));
  if (directiveRepeats > 2) {
    plan.next_speaker = INFRA_AUTHORITY;
    plan.directive =
      "Directive loop detected (>2 repeats). Take over, break loop, and issue concrete execution-lane assignments now.";
    plan.speech =
      "Loop guard triggered. " + INFRA_AUTHORITY +
      ", take control to break repeated directive loop and relaunch execution lanes with concrete assignments.";
    plan.nudges = ["BUILDEROFAGENTS", "YTA-ASSISTANT", "shopper-lead"];
  }

  const phase = directivePhase(String(plan?.directive ?? ""), String(plan?.speech ?? ""), resolveSpeaker(plan?.next_speaker));

  // 2) Post Chief speech
  if (plan.speech) {
    const addr = [plan.next_speaker, ...(plan.nudges ?? [])].filter(Boolean);
    await postMessage(CHIEF, String(plan.speech), "assistant", addr, {
      directive: plan.directive ?? null,
      phase,
      directive_repeat_count: directiveRepeats,
    });
  }

  // 3) Create tasks
  if (Array.isArray(plan.new_tasks)) {
    for (const t of plan.new_tasks) {
      if (!t?.title || !t?.assignee) continue;
      await sb.from("war_room_tasks").insert({
        title: String(t.title).slice(0, 200),
        description: t.description ?? null,
        assignee: String(t.assignee),
        priority: Number(t.priority ?? 3),
        created_by: CHIEF,
      });
    }
  }

  // 3.1) Capability/infrastructure actions (dynamic tool and infra planning).
  const toolActions = normalizePlannedActions(plan.tool_actions, "tool");
  const infraActions = normalizePlannedActions(plan.infra_actions, "infra");
  if (toolActions.length || infraActions.length) {
    await enqueueCapabilityActions([...toolActions, ...infraActions]);
  }

  // 4) Close tasks
  if (Array.isArray(plan.closed_tasks)) {
    for (const prefix of plan.closed_tasks) {
      const p = String(prefix).replace(/^#/, "").slice(0, 8);
      const match = tasks.find((t) => t.id.startsWith(p));
      if (match) await sb.from("war_room_tasks").update({ status: "done" }).eq("id", match.id);
    }
  }

  // 5) Next specialist replies via its REAL Azure Foundry runtime (no role-play).
  //    Every agent in the roster runs through foundry-agent-run, which invokes
  //    the actual /agents/{name} + /threads/{id}/runs surface and executes local
  //    tool calls (war_room_post, war_room_heartbeat, vapi_*).
  const planned = plan.next_speaker && SPECIALISTS.find((s) => s.name === plan.next_speaker) ? plan.next_speaker : null;
  const plannedErrors = planned ? countRecentAgentErrors(transcript, planned) : 0;
  const nextName = planned && planned !== INFRA_AUTHORITY && plannedErrors >= ESCALATE_AFTER_ERRORS
    ? INFRA_AUTHORITY
    : planned;

  if (planned && nextName === INFRA_AUTHORITY && planned !== INFRA_AUTHORITY) {
    await postMessage(
      CHIEF,
      "Escalation activated: " + planned + " has repeated failures. " + INFRA_AUTHORITY + ", take authority on recovery and infra actions.",
      "assistant",
      [INFRA_AUTHORITY, planned],
      { via: "escalation", reason: "repeated_errors", retries_seen: plannedErrors },
    );
  }

  if (shouldInvokeSpecialist(nextName, lastMsg)) {
    const directive = String(plan.directive ?? plan.speech ?? "give a status");
    const agentTasks = tasks.filter((t) => t.assignee === nextName);
    const message = [
      "[CHIEF OF STAFF DIRECTIVE — WAR ROOM]",
      directive,
      "",
      "Your open tasks: " + (agentTasks.map((t) => "#" + t.id.slice(0, 8) + " " + t.title).join(" | ") || "(none)"),
      "",
      "Recent room transcript (oldest→newest):",
      transcriptText(transcript.slice(-12)) || "(empty)",
      "",
      nextName === INFRA_AUTHORITY
        ? "You are escalation authority. Decide recovery, infra/resource changes, and publish the action plan back to Chief."
        : "If this task touches infra/resources/deployment policy, coordinate with " + INFRA_AUTHORITY + " before final decision.",
      "",
      "REQUIRED: Call the war_room_post tool with a 1-3 sentence status starting with ACK/WORKING/BLOCKED/DONE/READY_FOR_PAYMENT/ASKING. Then invoke whatever tools you need to advance the mission. Do not just narrate.",
    ].join("\n");

    const useChild = nextName !== INFRA_AUTHORITY && shouldUseEphemeralChild(nextName!);
    const execution = useChild
      ? await runWithEphemeralChildLifecycle(nextName!, message, transcript)
      : await runDirectWithRecovery(nextName!, message, transcript);
    const out = execution.out;

    if (!out?.ok && nextName !== INFRA_AUTHORITY) {
      await postMessage(
        CHIEF,
        "Stuck-loop exhausted for " + nextName + " after " + COACH_LOOP_ROUNDS + " rounds. Escalating.",
        "assistant",
        [INFRA_AUTHORITY, nextName!],
        {
          via: "stuck-loop-exhausted",
          execution_mode: execution.via,
          child_id: execution.child?.id ?? null,
          coach: execution.coach ?? null,
        },
      );
    }

    if (out?.ok) {
      if (out.finalText && !out.posted) {
        await postMessage(nextName!, out.finalText.slice(0, 1200), "assistant", [CHIEF], {
          via: "foundry-agent-run",
          steps: out.steps.length,
          execution_mode: execution.via,
          child_id: execution.child?.id ?? null,
        });
      }
    } else {
      const err = (out?.error ?? "empty").toString().slice(0, 240);
      await postMessage(nextName!, "(no response from Foundry after retries — " + err + ")", "error", [CHIEF], {
        retries: RETRY_ATTEMPTS,
        status: out?.status ?? null,
        execution_mode: execution.via,
        child_id: execution.child?.id ?? null,
      });
      if (nextName !== INFRA_AUTHORITY) {
        await createEscalationTask(nextName!, "Automatic escalation after " + RETRY_ATTEMPTS + " retries failed. Last error: " + err);
        await postMessage(
          CHIEF,
          INFRA_AUTHORITY + ", take over " + nextName + " recovery now. Approve and execute infra/resource fixes, then post decision. " +
            (execution.child?.id ? "Failed child session: " + execution.child.id + "." : ""),
          "assistant",
          [INFRA_AUTHORITY, nextName],
          { via: "auto-escalation", last_error: err, execution_mode: execution.via, child_id: execution.child?.id ?? null },
        );
      }
    }
  }


  return { ok: true, plan, stale };
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "tick");

    if (action === "post") {
      const { agent_name, content, role, addressed_to } = body;
      if (!agent_name || !content) return json({ ok: false, error: "agent_name and content required" }, 400);
      await postMessage(String(agent_name), String(content), role ?? "user", addressed_to ?? []);
      // After a human message, immediately run a Chief cycle
      const r = await tick();
      return json({ ok: true, ticked: r });
    }
    if (action === "assign") {
      const { title, description, assignee, priority } = body;
      if (!title || !assignee) return json({ ok: false, error: "title and assignee required" }, 400);
      const { data, error } = await sb.from("war_room_tasks").insert({
        title, description: description ?? null, assignee, priority: priority ?? 3, created_by: "You",
      }).select().single();
      if (error) throw error;
      return json({ ok: true, task: data });
    }
    if (action === "task_update") {
      const { id, status, result } = body;
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const patch: any = {};
      if (status) patch.status = status;
      if (result !== undefined) patch.result = result;
      const { error } = await sb.from("war_room_tasks").update(patch).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "heartbeat") {
      const { agent_name, status_line, current_task_id, mood } = body;
      if (!agent_name) return json({ ok: false, error: "agent_name required" }, 400);
      await sb.from("war_room_heartbeats").upsert({
        agent_name, status_line: status_line ?? null, current_task_id: current_task_id ?? null,
        mood: mood ?? "ready", last_beat_at: new Date().toISOString(),
      });
      return json({ ok: true });
    }
    if (action === "reset") {
      await sb.from("war_room_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await sb.from("war_room_tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await sb.from("war_room_heartbeats").delete().neq("agent_name", "");
      await postMessage(CHIEF, "Room reset. Roster online. Awaiting orders from CEO.", "assistant", []);
      return json({ ok: true });
    }
    // default: tick
    const r = await tick();
    return json(r);
  } catch (e) {
    console.error("war-room error:", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
