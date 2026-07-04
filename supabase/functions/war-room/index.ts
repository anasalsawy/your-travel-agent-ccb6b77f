// War Room — lean orchestration layer.
//
// External contract intentionally preserved:
//   post        { agent_name, content, role?, addressed_to? }
//   tick        {}
//   assign      { title, description?, assignee, priority? }
//   task_update { id, status?, result? }
//   heartbeat   { agent_name, status_line, current_task_id?, mood? }
//   reset       {}
//
// Internally this is no longer a role-play Chief of Staff. It is a compact
// dispatcher: classify the need, create/update structured tasks, invoke one real
// worker when useful, and escalate on real blockers.

import { createClient } from "npm:@supabase/supabase-js@2";
import { callReasonerJson, hasReasonerConfig } from "../_shared/reasoner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SVC);

const CHIEF = "chief-of-staff";
const INFRA_AUTHORITY = "internal-app-test-buildrunner";
const MAX_DIRECTIVE_REPEATS = 2;
const WORKER_TIMEOUT_MS = 25_000;
const REASONER_TIMEOUT_MS = 9_000;
const ERROR_WINDOW_MS = 20 * 60 * 1000;

type AgentRole = "customer" | "booking" | "infra" | "builder" | "shopper";
type AgentDef = { name: string; display: string; role: AgentRole; specialty: string };
type LoadedContext = { transcript: any[]; tasks: any[]; heartbeats: any[] };
type Plan = {
  action: "no_op" | "assign" | "call_worker" | "escalate" | "close_task";
  next_speaker: string | null;
  directive: string;
  chief_message: string;
  task_title?: string;
  task_description?: string;
  task_priority?: number;
  close_task_id?: string;
  reason: string;
};

type WorkerRun = {
  ok: boolean;
  posted: boolean;
  finalText: string;
  steps: any[];
  error: string | null;
  status: number;
};

const ROSTER: AgentDef[] = [
  { name: "assistant", display: "Concierge", role: "customer", specialty: "Customer-facing first-line answers, quotes, checkout links, customer handoff." },
  { name: "YTA-ASSISTANT", display: "Booking Worker", role: "booking", specialty: "Flight, hotel, car booking, reservation lookup, changes, cancellations, provider checkout paths." },
  { name: "BUILDEROFAGENTS", display: "Builder Worker", role: "builder", specialty: "Agent configuration, prompt/tool wiring, code planning, non-destructive implementation support." },
  { name: INFRA_AUTHORITY, display: "Infra/Code Worker", role: "infra", specialty: "Azure, Supabase, deployment, logs, resource edits, recovery, final escalation." },
  { name: "shopper-lead", display: "Shopping Worker", role: "shopper", specialty: "Product/shopping missions, price research, cart prep, deal comparison." },
];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function truncate(value: unknown, max = 1200): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function resolveSpeaker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const byName = ROSTER.find((a) => a.name.toLowerCase() === value.toLowerCase());
  if (byName) return byName.name;
  const byDisplay = ROSTER.find((a) => a.display.toLowerCase() === value.toLowerCase());
  return byDisplay?.name ?? null;
}

function roleForAgent(agentName: string | null): AgentRole | null {
  return ROSTER.find((a) => a.name === agentName)?.role ?? null;
}

function transcriptText(rows: any[], limit = 12): string {
  return rows.slice(-limit).map((m) => {
    const to = Array.isArray(m.addressed_to) && m.addressed_to.length ? " →" + m.addressed_to.join(",") : "";
    return `[${m.agent_name}${to}] ${truncate(m.content, 450)}`;
  }).join("\n");
}

function signature(text: string): string {
  return truncate(text, 260).toLowerCase();
}

function openTaskSummary(tasks: any[]): string {
  return tasks.map((t) => `#${String(t.id).slice(0, 8)} ${t.assignee}: ${t.title} [${t.status}/p${t.priority}]`).join(" | ") || "(none)";
}

async function postMessage(
  agent_name: string,
  content: string,
  role = "assistant",
  addressed_to: string[] = [],
  meta: Record<string, unknown> = {},
) {
  const clean = truncate(content, 4000);
  if (!clean) return;
  await sb.from("war_room_messages").insert({ agent_name, role, content: clean, addressed_to, meta });
  await sb.from("war_room_heartbeats").upsert({
    agent_name,
    status_line: clean.slice(0, 120),
    last_beat_at: new Date().toISOString(),
  });
}

async function loadContext(): Promise<LoadedContext> {
  const [msgs, tasks, hbs] = await Promise.all([
    sb.from("war_room_messages").select("*").order("created_at", { ascending: false }).limit(60),
    sb.from("war_room_tasks").select("*").in("status", ["todo", "doing"]).order("priority").order("created_at"),
    sb.from("war_room_heartbeats").select("*"),
  ]);
  if (msgs.error || tasks.error || hbs.error) {
    const details = [msgs.error?.message, tasks.error?.message, hbs.error?.message]
      .filter((m): m is string => Boolean(m && m.trim()))
      .join(" | ");
    throw new Error(`war_room_schema_or_rls_error: ${details || "loadContext failed"}`);
  }
  return {
    transcript: (msgs.data ?? []).reverse(),
    tasks: tasks.data ?? [],
    heartbeats: hbs.data ?? [],
  };
}

function classifyByText(text: string): { speaker: string; title: string; reason: string } {
  const t = text.toLowerCase();
  if (/azure|supabase|deploy|deployment|github|repo|code|function|edge function|env|secret|401|403|500|log|build|migration|lovable|gemini|chief|orchestrat/.test(t)) {
    return { speaker: INFRA_AUTHORITY, title: "Infra/code task", reason: "technical/infrastructure keywords" };
  }
  if (/flight|hotel|car rental|booking|reservation|ticket|duffel|amadeus|refund|cancel|change|upgrade|seat|pnr|confirmation/.test(t)) {
    return { speaker: "YTA-ASSISTANT", title: "Booking task", reason: "travel booking keywords" };
  }
  if (/shop|buy|purchase|cart|checkout|retailer|price|deal|coupon|stock/.test(t)) {
    return { speaker: "shopper-lead", title: "Shopping task", reason: "shopping/research keywords" };
  }
  if (/maya|customer|whatsapp|email|quote|lead|reply|message|conversation|call/.test(t)) {
    return { speaker: "assistant", title: "Customer/Maya task", reason: "customer communication keywords" };
  }
  return { speaker: "YTA-ASSISTANT", title: "Operations task", reason: "default operations route" };
}

function recentChiefDirectiveRepeats(transcript: any[], directive: string): number {
  const sig = signature(directive);
  if (!sig) return 0;
  return transcript.slice(-20).filter((m) => {
    if (m?.agent_name !== CHIEF) return false;
    const metaSig = String(m?.meta?.directive_signature ?? "");
    return metaSig && metaSig === sig;
  }).length;
}

function recentAgentErrors(transcript: any[], agentName: string): number {
  const now = Date.now();
  return transcript.filter((m) => {
    if (m?.agent_name !== agentName) return false;
    const ts = new Date(m?.created_at ?? 0).getTime();
    if (!Number.isFinite(ts) || now - ts > ERROR_WINDOW_MS) return false;
    const text = String(m?.content ?? "").toLowerCase();
    return m?.role === "error" || /blocked|no response|timeout|azure 4\d\d|azure 5\d\d|runtime error|tool_user_error/.test(text);
  }).length;
}

function shouldInvokeWorker(nextSpeaker: string | null, lastMsg: any): boolean {
  if (!nextSpeaker) return false;
  if (!lastMsg) return true;
  if (lastMsg.agent_name !== nextSpeaker) return true;
  if (lastMsg.role === "error") return true;
  const ts = new Date(lastMsg.created_at ?? 0).getTime();
  return !Number.isFinite(ts) || ts <= 0 || (Date.now() - ts) / 1000 > 45;
}

function deterministicPlan(ctx: LoadedContext): Plan {
  const last = ctx.transcript.at(-1);
  const openTask = ctx.tasks[0] ?? null;

  if (!last && !openTask) {
    return { action: "no_op", next_speaker: null, directive: "", chief_message: "", reason: "empty room" };
  }

  if (openTask) {
    const speaker = resolveSpeaker(openTask.assignee) ?? INFRA_AUTHORITY;
    return {
      action: "call_worker",
      next_speaker: speaker,
      directive: `Advance open task #${String(openTask.id).slice(0, 8)}: ${openTask.title}. ${openTask.description ?? ""}`.trim(),
      chief_message: `Routing open task to ${speaker}: ${openTask.title}`,
      reason: "oldest/highest-priority open task",
    };
  }

  if (last?.agent_name === CHIEF) {
    return { action: "no_op", next_speaker: null, directive: "", chief_message: "", reason: "last message already from orchestrator and no open tasks" };
  }

  const text = truncate(last?.content, 2000);
  const route = classifyByText(text);
  return {
    action: "assign",
    next_speaker: route.speaker,
    directive: text,
    chief_message: `Created task for ${route.speaker}: ${text.slice(0, 140)}`,
    task_title: route.title + ": " + text.slice(0, 120),
    task_description: text,
    task_priority: route.speaker === INFRA_AUTHORITY ? 1 : 2,
    reason: route.reason,
  };
}

function normalizePlan(raw: Record<string, unknown> | null, fallback: Plan): Plan {
  if (!raw) return fallback;
  const actionRaw = String(raw.action ?? fallback.action).toLowerCase();
  const action = ["no_op", "assign", "call_worker", "escalate", "close_task"].includes(actionRaw)
    ? actionRaw as Plan["action"]
    : fallback.action;
  const next = resolveSpeaker(raw.next_speaker) ?? fallback.next_speaker;
  const directive = truncate(raw.directive ?? fallback.directive, 1800);
  const chiefMessage = truncate(raw.chief_message ?? fallback.chief_message, 600);
  return {
    action,
    next_speaker: action === "no_op" ? null : next,
    directive,
    chief_message: chiefMessage,
    task_title: truncate(raw.task_title ?? fallback.task_title ?? "", 200) || undefined,
    task_description: truncate(raw.task_description ?? fallback.task_description ?? directive, 1000) || undefined,
    task_priority: Number(raw.task_priority ?? fallback.task_priority ?? 2),
    close_task_id: truncate(raw.close_task_id ?? fallback.close_task_id ?? "", 64) || undefined,
    reason: truncate(raw.reason ?? fallback.reason, 500),
  };
}

async function reasonedPlan(ctx: LoadedContext): Promise<{ plan: Plan; provider: "reasoner" | "deterministic"; provider_error?: string }> {
  const fallback = deterministicPlan(ctx);
  if (!hasReasonerConfig()) return { plan: fallback, provider: "deterministic" };

  const system = [
    "You are YTA Orchestrator, a non-theatrical task router for a travel-agent operations room.",
    "Return JSON only.",
    "Do not roleplay. Do not create fake child agents. Do not narrate management stages.",
    "Choose exactly one useful next action: no_op, assign, call_worker, escalate, or close_task.",
    "Only route to these workers: assistant, YTA-ASSISTANT, BUILDEROFAGENTS, internal-app-test-buildrunner, shopper-lead.",
    "Use deterministic evidence first. Escalate destructive, credential, purchase, deployment, and repeated-failure issues to internal-app-test-buildrunner.",
    "Schema: { action, next_speaker, directive, chief_message, task_title, task_description, task_priority, close_task_id, reason }",
  ].join("\n");
  const user = [
    "Recent transcript:", transcriptText(ctx.transcript, 16) || "(empty)",
    "",
    "Open tasks:", openTaskSummary(ctx.tasks),
    "",
    "Fallback plan:", JSON.stringify(fallback),
  ].join("\n");

  try {
    const raw = await callReasonerJson([
      { role: "system", content: system },
      { role: "user", content: user },
    ], { timeoutMs: REASONER_TIMEOUT_MS, temperature: 0, maxTokens: 700 });
    return { plan: normalizePlan(raw, fallback), provider: "reasoner" };
  } catch (e) {
    return { plan: fallback, provider: "deterministic", provider_error: (e as Error).message };
  }
}

async function createTaskFromPlan(plan: Plan, createdBy = CHIEF): Promise<any | null> {
  if (!plan.task_title || !plan.next_speaker) return null;
  const { data, error } = await sb.from("war_room_tasks").insert({
    title: plan.task_title.slice(0, 200),
    description: plan.task_description ?? plan.directive ?? null,
    assignee: plan.next_speaker,
    priority: Number.isFinite(plan.task_priority) ? plan.task_priority : 2,
    created_by: createdBy,
    status: "todo",
  }).select().single();
  if (error) throw error;
  return data;
}

async function createEscalationTask(failingAgent: string, details: string): Promise<any | null> {
  const { data, error } = await sb.from("war_room_tasks").insert({
    title: `Escalation: ${failingAgent}`.slice(0, 200),
    description: details.slice(0, 1000),
    assignee: INFRA_AUTHORITY,
    priority: 1,
    created_by: CHIEF,
    status: "todo",
  }).select().single();
  if (error) throw error;
  return data;
}

async function runWorker(agentName: string, message: string, source: string): Promise<WorkerRun> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/foundry-agent-run`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
      body: JSON.stringify({ agentName, channel: "war-room", externalId: "war-room", source, message }),
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });
    const body = await r.json().catch(() => ({}));
    const finalText = truncate(body?.text, 4000);
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const posted = steps.some((s: any) => s?.tool === "war_room_post");
    const ok = r.ok && body?.ok !== false && (posted || Boolean(finalText));
    return { ok, posted, finalText, steps, error: ok ? null : String(body?.error ?? `http_${r.status}`), status: r.status };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return { ok: false, posted: false, finalText: "", steps: [], error: /abort|timeout/i.test(msg) ? "worker_timeout" : msg, status: 599 };
  }
}

function buildWorkerDirective(agentName: string, plan: Plan, ctx: LoadedContext): string {
  const tasks = ctx.tasks.filter((t) => t.assignee === agentName);
  const role = roleForAgent(agentName) ?? "infra";
  return [
    "[YTA ORCHESTRATOR DIRECTIVE]",
    `worker: ${agentName}`,
    `worker_role: ${role}`,
    `objective: ${plan.directive || plan.task_description || plan.task_title || "advance assigned task"}`,
    "",
    "Rules:",
    "- Do one concrete next step using real tools when available.",
    "- Post a concise war_room_post update only if there is a meaningful result, blocker, or owner decision needed.",
    "- Do not narrate management stages. Do not spawn pretend sub-agents.",
    "- If blocked, provide exact blocker evidence and the safest fallback.",
    "- Destructive actions, payments, purchases, credentials, and irreversible infra changes require owner/infra approval.",
    "",
    "Open tasks for you:",
    tasks.map((t) => `#${String(t.id).slice(0, 8)} ${t.title}: ${t.description ?? ""}`).join("\n") || "(none)",
    "",
    "Recent room context:",
    transcriptText(ctx.transcript, 12) || "(empty)",
  ].join("\n");
}

async function executePlan(plan: Plan, ctx: LoadedContext, provider: string, providerError?: string) {
  const lastMsg = ctx.transcript.at(-1);
  const dirSig = signature(plan.directive || plan.chief_message || plan.task_title || "");
  const repeats = recentChiefDirectiveRepeats(ctx.transcript, dirSig);

  if (dirSig && repeats > MAX_DIRECTIVE_REPEATS) {
    const task = await createEscalationTask(plan.next_speaker ?? "unknown", `Directive repeated more than ${MAX_DIRECTIVE_REPEATS} times and was suppressed. Directive: ${plan.directive}`);
    await postMessage(
      CHIEF,
      `Loop guard: suppressed repeated directive and escalated to ${INFRA_AUTHORITY}.`,
      "assistant",
      [INFRA_AUTHORITY],
      { via: "loop_guard", directive_signature: dirSig, directive_repeat_count: repeats, task_id: task?.id ?? null },
    );
    return { ok: true, action_taken: "escalated_loop_guard", task_id: task?.id ?? null, next_speaker: INFRA_AUTHORITY, escalation: true };
  }

  if (plan.action === "no_op") {
    return { ok: true, action_taken: "no_op", reason: plan.reason, next_speaker: null, escalation: false };
  }

  if (plan.action === "close_task" && plan.close_task_id) {
    await sb.from("war_room_tasks").update({ status: "done", result: plan.reason || "Closed by orchestrator." }).eq("id", plan.close_task_id);
    await postMessage(CHIEF, plan.chief_message || `Closed task ${plan.close_task_id.slice(0, 8)}.`, "assistant", [], {
      via: "task_closed",
      directive_signature: dirSig,
      provider,
      provider_error: providerError ?? null,
    });
    return { ok: true, action_taken: "task_closed", task_id: plan.close_task_id, next_speaker: null, escalation: false };
  }

  let task: any | null = null;
  if (plan.action === "assign") {
    task = await createTaskFromPlan(plan);
    await postMessage(CHIEF, plan.chief_message || `Task assigned to ${plan.next_speaker}.`, "assistant", plan.next_speaker ? [plan.next_speaker] : [], {
      via: "task_assigned",
      task_id: task?.id ?? null,
      directive_signature: dirSig,
      provider,
      provider_error: providerError ?? null,
      reason: plan.reason,
    });
  } else if (plan.chief_message) {
    await postMessage(CHIEF, plan.chief_message, "assistant", plan.next_speaker ? [plan.next_speaker] : [], {
      via: plan.action === "escalate" ? "escalation" : "worker_route",
      directive_signature: dirSig,
      provider,
      provider_error: providerError ?? null,
      reason: plan.reason,
    });
  }

  let nextSpeaker = plan.next_speaker;
  if (!nextSpeaker) {
    return { ok: true, action_taken: plan.action, task_id: task?.id ?? null, next_speaker: null, escalation: false };
  }

  const errors = recentAgentErrors(ctx.transcript, nextSpeaker);
  if (nextSpeaker !== INFRA_AUTHORITY && errors >= 2) {
    task = await createEscalationTask(nextSpeaker, `Repeated recent failures (${errors}) for ${nextSpeaker}; routing recovery to ${INFRA_AUTHORITY}.`);
    await postMessage(CHIEF, `${nextSpeaker} has repeated failures. Escalated to ${INFRA_AUTHORITY}.`, "assistant", [INFRA_AUTHORITY, nextSpeaker], {
      via: "failure_escalation",
      task_id: task?.id ?? null,
      failed_agent: nextSpeaker,
      recent_errors: errors,
    });
    nextSpeaker = INFRA_AUTHORITY;
  }

  if (!shouldInvokeWorker(nextSpeaker, lastMsg)) {
    return { ok: true, action_taken: "worker_wait", task_id: task?.id ?? null, next_speaker: nextSpeaker, escalation: nextSpeaker === INFRA_AUTHORITY };
  }

  const workerDirective = buildWorkerDirective(nextSpeaker, plan, ctx);
  let out = await runWorker(nextSpeaker, workerDirective, "war-room-orchestrator");
  if (!out.ok) {
    out = await runWorker(nextSpeaker, workerDirective + "\n\nFallback attempt: use the smallest safe next step and post exact blocker evidence if still blocked.", "war-room-orchestrator-retry");
  }

  if (out.ok) {
    if (out.finalText && !out.posted) {
      await postMessage(nextSpeaker, out.finalText, "assistant", [CHIEF], { via: "worker_result", steps: out.steps.length });
    }
    return { ok: true, action_taken: "worker_completed", task_id: task?.id ?? null, next_speaker: nextSpeaker, escalation: false };
  }

  const err = truncate(out.error ?? "empty", 300);
  const escalationTask = nextSpeaker === INFRA_AUTHORITY
    ? null
    : await createEscalationTask(nextSpeaker, `Worker failed after bounded retries. Last error: ${err}`);
  await postMessage(nextSpeaker, `(worker failed after bounded retries: ${err})`, "error", [CHIEF], {
    via: "worker_failed",
    retries: 2,
    status: out.status,
  });
  if (nextSpeaker !== INFRA_AUTHORITY) {
    await postMessage(CHIEF, `Escalated ${nextSpeaker} failure to ${INFRA_AUTHORITY}.`, "assistant", [INFRA_AUTHORITY, nextSpeaker], {
      via: "auto_escalation",
      task_id: escalationTask?.id ?? null,
      last_error: err,
    });
  }
  return { ok: false, action_taken: "worker_failed_escalated", task_id: escalationTask?.id ?? task?.id ?? null, next_speaker: nextSpeaker, escalation: nextSpeaker !== INFRA_AUTHORITY, error: err };
}

async function tick() {
  const ctx = await loadContext();
  const { plan, provider, provider_error } = await reasonedPlan(ctx);
  const result = await executePlan(plan, ctx, provider, provider_error);
  return {
    ok: result.ok,
    chief_message: plan.chief_message || null,
    next_speaker: result.next_speaker ?? plan.next_speaker ?? null,
    action_taken: result.action_taken,
    task_id: result.task_id ?? null,
    escalation: Boolean(result.escalation),
    reason: plan.reason,
    provider,
    provider_error: provider_error ?? null,
    error: result.error ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "tick");

    if (action === "post") {
      const { agent_name, content, role, addressed_to } = body;
      if (!agent_name || !content) return json({ ok: false, error: "agent_name and content required" }, 400);
      await postMessage(String(agent_name), String(content), role ?? "user", Array.isArray(addressed_to) ? addressed_to : []);
      const ticked = await tick();
      return json({ ok: true, ticked });
    }

    if (action === "assign") {
      const { title, description, assignee, priority } = body;
      if (!title || !assignee) return json({ ok: false, error: "title and assignee required" }, 400);
      const resolved = resolveSpeaker(String(assignee)) ?? String(assignee);
      const { data, error } = await sb.from("war_room_tasks").insert({
        title: String(title).slice(0, 200),
        description: description ?? null,
        assignee: resolved,
        priority: priority ?? 3,
        created_by: "You",
      }).select().single();
      if (error) throw error;
      return json({ ok: true, task: data });
    }

    if (action === "task_update") {
      const { id, status, result } = body;
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
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
        agent_name: String(agent_name),
        status_line: status_line ? String(status_line).slice(0, 120) : null,
        current_task_id: current_task_id ?? null,
        mood: mood ?? "ready",
        last_beat_at: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    if (action === "reset") {
      await sb.from("war_room_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await sb.from("war_room_tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await sb.from("war_room_heartbeats").delete().neq("agent_name", "");
      await postMessage(CHIEF, "Room reset. YTA Orchestrator online. Awaiting a concrete task.", "assistant", [], { via: "reset" });
      return json({ ok: true });
    }

    return json(await tick());
  } catch (e) {
    console.error("war-room error:", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
