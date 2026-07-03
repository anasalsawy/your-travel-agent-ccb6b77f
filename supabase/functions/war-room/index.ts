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
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.ok === false) {
    throw new Error(String(j?.error ?? ("planner_http_" + r.status)));
  }
  return parsePlanJson(String(j?.text ?? ""));
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

function retryMessage(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  if (attempt === 2) {
    return base + "\n\nRETRY MODE A: keep it minimal. Post ACK via war_room_post first, then execute one smallest next tool step.";
  }
  return base + "\n\nRETRY MODE B: choose a different path/tool than prior attempts. If still blocked, post evidence + exact blocker + next fallback.";
}

type AgentRun = { ok: boolean; posted: boolean; finalText: string; steps: any[]; error: string | null; status: number };
async function runSpecialist(agentName: string, message: string, source: string): Promise<AgentRun> {
  const r = await fetch(SB_URL + "/functions/v1/foundry-agent-run", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
    body: JSON.stringify({ agentName, channel: "war-room", externalId: "war-room", message, source }),
  });
  const jr = await r.json().catch(() => ({}));
  const finalText = String(jr?.text ?? "").trim();
  const steps = Array.isArray(jr?.steps) ? jr.steps : [];
  const posted = steps.some((s: any) => s?.tool === "war_room_post");
  const ok = r.ok && jr?.ok !== false && (posted || !!finalText);
  const error = ok ? null : String(jr?.error ?? ("http_" + r.status));
  return { ok, posted, finalText, steps, error, status: r.status };
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

  // 2) Post Chief speech
  if (plan.speech) {
    const addr = [plan.next_speaker, ...(plan.nudges ?? [])].filter(Boolean);
    await postMessage(CHIEF, String(plan.speech), "assistant", addr, { directive: plan.directive ?? null });
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

    let out: AgentRun | null = null;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      out = await runSpecialist(nextName!, retryMessage(message, attempt), attempt === 1 ? "cron-tick" : ("cron-tick-retry-" + attempt));
      if (out.ok) break;
    }

    if (!out?.ok && nextName !== INFRA_AUTHORITY) {
      const firstErr = (out?.error ?? "empty").toString();
      const loop = await runCoachLoop(nextName!, message, transcript, firstErr);
      out = loop.out;
      if (!out) {
        await postMessage(
          CHIEF,
          "Stuck-loop exhausted for " + nextName + " after " + COACH_LOOP_ROUNDS + " rounds with " + loop.coach + ". Escalating.",
          "assistant",
          [INFRA_AUTHORITY, nextName!],
          { via: "stuck-loop-exhausted" },
        );
      }
    }

    if (out?.ok) {
      if (out.finalText && !out.posted) {
        await postMessage(nextName!, out.finalText.slice(0, 1200), "assistant", [CHIEF], { via: "foundry-agent-run", steps: out.steps.length });
      }
    } else {
      const err = (out?.error ?? "empty").toString().slice(0, 240);
      await postMessage(nextName!, "(no response from Foundry after retries — " + err + ")", "error", [CHIEF], { retries: RETRY_ATTEMPTS, status: out?.status ?? null });
      if (nextName !== INFRA_AUTHORITY) {
        await sb.from("war_room_tasks").insert({
          title: "Escalation: recover " + nextName,
          description: "Automatic escalation after " + RETRY_ATTEMPTS + " retries failed. Last error: " + err,
          assignee: INFRA_AUTHORITY,
          priority: 1,
          created_by: CHIEF,
        });
        await postMessage(
          CHIEF,
          INFRA_AUTHORITY + ", take over " + nextName + " recovery now. Approve and execute infra/resource fixes, then post decision.",
          "assistant",
          [INFRA_AUTHORITY, nextName],
          { via: "auto-escalation", last_error: err },
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
