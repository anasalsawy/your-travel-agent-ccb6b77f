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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const sb = createClient(SB_URL, SVC);

// ---------- Roster (main agents only; keep tight) ----------
const CHIEF = "chief-of-staff";
type AgentDef = { name: string; display: string; role: string; specialty: string };
const ROSTER: AgentDef[] = [
  { name: CHIEF,               display: "Chief of Staff",     role: "leader",   specialty: "Coordinates the room. Assigns tasks by specialty. Demands heartbeats. Pings idle agents. Synthesizes and closes work." },
  { name: "assistant",         display: "Concierge",          role: "customer", specialty: "Front-desk / customer voice. Quotes, checkout links, first-line answers." },
  { name: "YTA-ASSISTANT",     display: "Booking Delegate",   role: "booking",  specialty: "Autonomous flight/hotel/car booking, changes, cancels, reservation lookup." },
  { name: "BUILDEROFAGENTS",   display: "Master Builder",     role: "builder",  specialty: "Spawns/edits agents, plans code + infra work, orchestrates the builder helpers." },
  { name: "shopper-lead",      display: "Shopper Chief",      role: "shopper",  specialty: "Runs shopping missions: research→plan→tactics→execute→verify with 3 helpers." },
  { name: "shopper-helper-1",  display: "Research Analyst",   role: "shopper",  specialty: "Retailer matrix, price/stock/friction recon." },
  { name: "shopper-helper-2",  display: "Tactical Operator",  role: "shopper",  specialty: "Cart prep, anti-bot, captcha, auth pivots." },
  { name: "shopper-helper-3",  display: "Field Buyer",        role: "shopper",  specialty: "Atomic checkouts. One purchase per turn." },
];
const SPECIALISTS = ROSTER.filter((a) => a.name !== CHIEF);
const STALE_SECS = 90;

// ---------- Helpers ----------
async function llm(system: string, user: string, opts: { json?: boolean; max?: number } = {}) {
  const body: any = {
    model: "google/gemini-2.5-flash",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: opts.max ?? 500,
    temperature: 0.7,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + LOVABLE_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("LLM " + r.status + ": " + JSON.stringify(j).slice(0, 400));
  return String(j.choices?.[0]?.message?.content ?? "").trim();
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

// ---------- Chief of Staff cycle ----------
async function tick() {
  const { transcript, tasks, heartbeats } = await loadContext();
  const stale = staleAgents(heartbeats);
  const openTasks = tasks.map((t) => "#" + t.id.slice(0, 8) + " [" + t.status + " p" + t.priority + "] @" + t.assignee + " — " + t.title).join("\n") || "(no open tasks)";
  const rosterList = SPECIALISTS.map((a) => "- " + a.name + " (" + a.display + "): " + a.specialty).join("\n");
  const lastMsg = transcript[transcript.length - 1];

  // 1) Chief speaks — decides action as JSON
  const chiefSystem = [
    "You are the CHIEF OF STAFF of a live coordination war room.",
    "You never do specialist work yourself. You OBSERVE, DECIDE, ASSIGN, and NUDGE.",
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
    const raw = await llm(chiefSystem, chiefUser, { json: true, max: 600 });
    plan = JSON.parse(raw);
  } catch (e) {
    plan = { speech: "Standing by — brain hiccup: " + (e as Error).message.slice(0, 80), next_speaker: null };
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
  const nextName = plan.next_speaker && SPECIALISTS.find((s) => s.name === plan.next_speaker) ? plan.next_speaker : null;
  if (nextName && lastMsg?.agent_name !== nextName) {
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
      "REQUIRED: Call the war_room_post tool with a 1-3 sentence status starting with ACK/WORKING/BLOCKED/DONE/READY_FOR_PAYMENT/ASKING. Then invoke whatever tools you need to advance the mission. Do not just narrate.",
    ].join("\n");
    try {
      const r = await fetch(SB_URL + "/functions/v1/foundry-agent-run", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
        body: JSON.stringify({ agentName: nextName, channel: "war-room", externalId: "war-room", message }),
      });
      const jr = await r.json();
      // If the agent didn't post via war_room_post but returned final text, mirror it.
      const finalText = String(jr?.text ?? "").trim();
      const posted = Array.isArray(jr?.steps) && jr.steps.some((s: any) => s?.tool === "war_room_post");
      if (finalText && !posted) {
        await postMessage(nextName, finalText.slice(0, 1200), "assistant", [CHIEF], { via: "foundry-agent-run", steps: jr?.steps?.length ?? 0 });
      } else if (!finalText && !posted) {
        await postMessage(nextName, "(no response from Foundry — " + (jr?.error ?? "empty").toString().slice(0, 120) + ")", "error", [CHIEF]);
      }
    } catch (e) {
      await postMessage(nextName, "BLOCKED — Foundry runtime error: " + (e as Error).message.slice(0, 140), "error", [CHIEF]);
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
