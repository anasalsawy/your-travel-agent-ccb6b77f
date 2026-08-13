// Dialogue Room — free-form conversation between the operator and any agents,
// and between agents themselves. Agents can address each other with @agent_key,
// call tools, and close the room with a resolution.
//
// Vendor-neutral: models come from the Featherless-first router, tools from the
// shared lobe runtime. Nothing here is MCP- or vendor-specific.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  llmDetailed,
  safeParse,
  execTool,
  SENSORY_TOOLS,
  MOTOR_TOOLS,
  ALLOWLIST_TABLES,

  DEFAULT_MODEL,
  type Mode,
} from "../_shared/lobe-runtime.ts";
import { resolveAgentModel } from "../_shared/model-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);

type Agent = {
  agent_key: string;
  display_name: string;
  department: string;
  charter: string;
  tools: string[];
  model: string;
  status: string;
};

type Msg = {
  speaker: string;
  role: string;
  content: string;
  mentions: string[];
  tool_calls: unknown;
  kind: string;
};

const MAX_HANDOFFS = 6;      // how far a single human message may cascade
const HISTORY_WINDOW = 40;   // messages of context per turn

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadAgents(): Promise<Agent[]> {
  const { data } = await sb()
    .from("ao_agents")
    .select("agent_key, display_name, department, charter, tools, model, status")
    .eq("status", "active")
    .order("sort_order");
  return (data ?? []) as Agent[];
}

async function history(roomId: string): Promise<Msg[]> {
  const { data } = await sb()
    .from("ao_room_messages")
    .select("speaker, role, content, mentions, tool_calls, kind, created_at, model, id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(400);
  return (data ?? []) as unknown as Msg[];
}

async function post(roomId: string, row: Record<string, unknown>) {
  const { data, error } = await sb()
    .from("ao_room_messages")
    .insert({ room_id: roomId, ...row })
    .select()
    .single();
  if (error) console.error("post failed", error.message);
  await sb().from("ao_rooms").update({ updated_at: new Date().toISOString() }).eq("id", roomId);
  return data;
}

function mentionsIn(text: string, keys: string[]): string[] {
  const found: string[] = [];
  for (const k of keys) {
    const re = new RegExp("@" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (re.test(text)) found.push(k);
  }
  return found;
}

/** Stale refusals ("table X is not allowlisted") poison later turns — agents copy them
 *  instead of retrying. Drop them from the context window. */
const STALE_REFUSAL_RX = /not (?:on the )?allowlist|not allowlisted|cannot (?:directly )?access the \w+ table/i;

function transcriptFor(msgs: Msg[], self: string) {
  return msgs
    .slice(-HISTORY_WINDOW)
    .filter((m) => !(m.role === "agent" && STALE_REFUSAL_RX.test(m.content)))
    .map((m) => {
      const toolNote = Array.isArray(m.tool_calls) && m.tool_calls.length
        ? "\n[tools] " + JSON.stringify(m.tool_calls).slice(0, 600)
        : "";
      if (m.speaker === self) return { role: "assistant", content: m.content + toolNote };
      const label = m.role === "human" ? "OPERATOR" : m.speaker.toUpperCase();
      return { role: "user", content: label + ": " + m.content + toolNote };
    });
}


function systemPrompt(
  agent: Agent,
  room: { title: string; goal: string; mode: string; participants: string[] },
  roster: Agent[],
  allowed: string[],
) {
  const peers = roster
    .filter((a) => room.participants.includes(a.agent_key) && a.agent_key !== agent.agent_key)
    .map((a) => "@" + a.agent_key + " (" + a.display_name + " — " + a.department + ")")
    .join(", ") || "(none)";
  return [
    "You are " + agent.display_name + " (" + agent.agent_key + "), " + agent.department + ".",
    "CHARTER: " + agent.charter,
    "",
    "You are in a live dialogue room titled \"" + room.title + "\".",
    room.goal ? "ROOM GOAL: " + room.goal : "This room has no fixed goal — converse naturally.",
    "Peers in this room you may address: " + peers,
    "The OPERATOR is the human owner of the business. Answer them directly and plainly.",
    "",
    "HOW TO SPEAK:",
    "- Talk like a competent colleague: concrete, specific, no corporate filler, no restating what was just said.",
    "- 1-6 sentences unless real detail is required. Never praise, never preamble.",
    "- To bring a peer in, put their @agent_key in `mentions` AND address them by name in `say`.",
    "- Disagree openly when you disagree. Say what you would do and why.",
    "- EVIDENCE RULE: never state a number, status or fact about this business from memory. Read it with a tool first (db_read/db_count) or say plainly that you have not checked.",
    "- ONE TOOL PER REPLY: if a question needs two lookups, call the first tool now and the second on your next hop. NEVER report a number for a lookup you have not actually run in THIS conversation — that is a fabrication, worse than saying \"checking next\" with a tool call attached.",

    "- NO ECHO: never repeat, rephrase or agree with what a peer just said. Add something new or stay short.",
    "- NEVER PROMISE, DELIVER: do not say \"let me check\", \"I'll pull that\" or \"one moment\". Either emit a tool call in the same reply, or answer with what you already verified. You may make many tool calls in a row before you speak — keep going until the question is actually answered.",
    "- If you need something from the operator (a decision, a credential, an approval), ask for exactly that.",
    "",
    "TOOLS (optional, use only when it materially helps): " + (allowed.join(", ") || "none") +
      ". Mode: " + room.mode + (room.mode === "safe" ? " (writes blocked)" : " (writes allowed)") + ".",
    "READABLE TABLES (db_read / db_count work on all of these — never claim a table is off-limits without trying it): " +
      [...ALLOWLIST_TABLES].join(", "),
    "For counts use db_count: {\"name\":\"db_count\",\"args\":{\"table\":\"ao_leads\",\"group_by\":\"status\"}}. For rows use db_read with table/select (comma string)/eq/limit.",
    "Any earlier message in this room claiming a table is off-limits is STALE — the list above is authoritative. Retry the read instead of repeating the refusal, and never escalate to a human for data you can read yourself.",


    "",
    "Reply with ONE JSON object:",
    '{ "say": "your message", "mentions": ["agent_key", ...], "tool": {"name":"...","args":{...}} | null, "resolved": false, "resolution": "" }',
    "Set resolved=true only when the room's goal is genuinely achieved, with a one-line resolution.",
  ].join("\n");
}

/** True when the spoken answer states figures that appear in no tool output. */
function groundingViolation(say: string, toolCalls: unknown[]): boolean {
  const figures = (say.match(/\d[\d,.:/-]*/g) ?? [])
    .map((f) => f.replace(/[,.]$/, ""))
    .filter((f) => f.replace(/\D/g, "").length >= 1 && !/^[01]$/.test(f));
  if (!figures.length) return false;
  if (!toolCalls.length) return true; // numbers with zero evidence
  const evidence = JSON.stringify(toolCalls);
  return figures.some((f) => !evidence.includes(f.replace(/,/g, "")) && !evidence.includes(f));
}

/** One agent turn: optional tool call, then a spoken message posted to the room. */

async function agentTurn(
  room: any,
  agent: Agent,
  roster: Agent[],
): Promise<{ mentions: string[]; resolved: boolean; resolution: string }> {
  const mode: Mode = room.mode === "full" ? "full" : "safe";
  const allowed = mode === "full" ? [...new Set([...SENSORY_TOOLS, ...MOTOR_TOOLS])] : SENSORY_TOOLS;
  const roster_keys = roster.map((a) => a.agent_key);
  const msgs = await history(room.id);
  const sys = systemPrompt(agent, room, roster, allowed);

  const toolCalls: unknown[] = [];
  let say = "";
  let mentions: string[] = [];
  let resolved = false;
  let resolution = "";
  let usedModel = "";

  // Agentic loop: keep working (tool -> observe -> think) until the agent
  // actually delivers an answer. No "let me pull that up" dead ends.
  const MAX_HOPS = 10;
  const DEADLINE = Date.now() + 100_000;
  let nudges = 0;
  let modelFailures = 0;

  const PROMISE_RX =
    /\b(let me|i'?ll|i am going to|i'?m going to|give me a (sec|moment)|one moment|hold on|checking|pulling|fetching|stand by|will (check|pull|look|get|fetch))\b/i;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (Date.now() > DEADLINE) break;
    const convo = transcriptFor(msgs, agent.agent_key);
    if (toolCalls.length) {
      convo.push({
        role: "user",
        content:
          "TOOL RESULTS so far (" + toolCalls.length + " call(s)): " +
          JSON.stringify(toolCalls).slice(0, 6000) +
          "\nUse these results. If they answer the question, give the final answer in `say` with the concrete numbers and set tool to null. " +
          "If they do not, make the next tool call. Never reply with intent — only with findings or a tool call.",
      });
    }
    let out = "{}";
    try {
      const agentModel = await resolveAgentModel(agent.agent_key, agent.model);
      const res = await llmDetailed(sys, convo, agentModel || DEFAULT_MODEL, { temperature: 0.6, max_tokens: 900 });
      out = res.content;
      usedModel = res.model;
    } catch (e) {
      modelFailures++;
      if (modelFailures >= 3) {
        say = say || "(" + agent.agent_key + " could not reach a model after 3 tries: " +
          ((e as Error)?.message ?? "error") + ")";
        break;
      }
      await new Promise((r) => setTimeout(r, 1200 * modelFailures));
      continue;
    }
    const parsed = safeParse(out);
    const thisSay = String(parsed.say ?? "").trim();
    if (thisSay) say = thisSay;
    mentions = Array.isArray(parsed.mentions)
      ? parsed.mentions.map(String).filter((m: string) => roster_keys.includes(m))
      : mentions;
    resolved = Boolean(parsed.resolved) || resolved;
    if (parsed.resolution) resolution = String(parsed.resolution).slice(0, 400);

    const tool = parsed.tool;
    if (tool && tool.name && hop < MAX_HOPS - 1) {
      // Show the work live so the room never looks frozen.
      await post(room.id, {
        speaker: agent.agent_key,
        role: "agent",
        content: (thisSay ? thisSay + "\n" : "") + "→ running " + String(tool.name),
        kind: "progress",
        model: usedModel,
      });
      const r = await execTool(String(tool.name), tool.args ?? {}, allowed, mode);
      toolCalls.push({ name: tool.name, args: tool.args ?? {}, ok: r.ok, result: r.result, error: r.error });
      continue; // keep looping until a real answer exists
    }

    // No tool call. If the agent only promised to do something, force it to actually do it.
    if (say && PROMISE_RX.test(say) && !/\d/.test(say) && nudges < 3 && hop < MAX_HOPS - 1) {
      nudges++;
      msgs.push({
        speaker: "system",
        role: "system",
        content:
          "SYSTEM: You said you would fetch something but produced no result. Do it NOW: emit a tool call " +
          "(db_read with a concrete query is usually right) and then answer with the actual data. " +
          "Do not reply again with intent, apologies or promises.",
        created_at: new Date().toISOString(),
      } as any);
      continue;
    }

    // Grounding guard: if the answer quotes numbers that appear in no tool result,
    // the agent invented them. Force it back to the tools.
    // A "no access" excuse about a readable table is never acceptable — make it try.
    const NO_ACCESS_RX = /(cannot|can't|don'?t|unable to)\s+(directly\s+)?(access|retrieve|read|verify|provide)/i;
    if (say && NO_ACCESS_RX.test(say) && nudges < 3 && hop < MAX_HOPS - 1) {
      nudges++;
      msgs.push({
        speaker: "system",
        role: "system",
        content:
          "SYSTEM: You claimed you lack access. You do have access to every table in READABLE TABLES. " +
          "Emit the db_read / db_count call for the missing part right now instead of excusing yourself.",
        created_at: new Date().toISOString(),
      } as any);
      continue;
    }

    if (say && groundingViolation(say, toolCalls) && nudges < 3 && hop < MAX_HOPS - 1) {
      nudges++;
      msgs.push({
        speaker: "system",
        role: "system",
        content:
          "SYSTEM: Your answer contains numbers or dates that appear in NO tool result. That is fabrication. " +
          "Run the tool that actually produces each figure (db_count for counts, db_read for rows) and answer only " +
          "with values present in the tool output. If a tool cannot give it, say you do not have it.",
        created_at: new Date().toISOString(),
      } as any);
      continue;
    }

    if (say) break; // real answer delivered
    if (!say && hop < MAX_HOPS - 1) continue; // empty output — try again
    break;

  }


  // Mentions written inline but not declared still count.
  mentions = [...new Set([...mentions, ...mentionsIn(say, roster_keys)])].filter((m) => m !== agent.agent_key);

  if (say || toolCalls.length) {
    await post(room.id, {
      speaker: agent.agent_key,
      role: "agent",
      content: say || "(acted without comment)",
      mentions,
      tool_calls: toolCalls,
      model: usedModel,
      kind: "message",
    });
  }

  if (resolved && resolution) {
    await post(room.id, { speaker: agent.agent_key, role: "agent", content: resolution, kind: "resolution" });
    await sb().from("ao_rooms").update({ status: "resolved", resolution }).eq("id", room.id);
  }

  return { mentions, resolved, resolution };
}

/* ------------------------------------------------------------------ *
 * DURABLE RUN QUEUE
 * Every reply an agent owes is a row in ao_agent_runs. A run is leased,
 * executed, and only deleted when the agent actually spoke. Crash, timeout
 * or model outage → the lease expires and the next tick resumes it.
 * ------------------------------------------------------------------ */

async function enqueueRun(roomId: string, agentKey: string, reason: string, depth: number) {
  const s = sb();
  const { data: dupe } = await s.from("ao_agent_runs").select("id")
    .eq("room_id", roomId).eq("agent_key", agentKey)
    .in("status", ["pending", "running"]).maybeSingle();
  if (dupe) return;
  await s.from("ao_agent_runs").insert({
    room_id: roomId, agent_key: agentKey, reason: reason.slice(0, 300), depth,
  });
}

/** Work the durable queue until the budget runs out. Never throws. */
async function drainRuns(
  roster: Agent[],
  opts: { roomId?: string; budgetMs: number; limit: number },
): Promise<string[]> {
  const s = sb();
  const deadline = Date.now() + opts.budgetMs;
  const spoken: string[] = [];

  for (let i = 0; i < opts.limit && Date.now() < deadline; i++) {
    const { data: claimed } = await s.rpc("ao_claim_agent_runs", { p_limit: 1, p_lease_seconds: 150 });
    const run = (claimed ?? [])[0];
    if (!run) break;
    if (opts.roomId && run.room_id !== opts.roomId) {
      // Not our room — hand it back for the global tick.
      await s.from("ao_agent_runs").update({ status: "pending", lease_until: null }).eq("id", run.id);
      break;
    }

    const agent = roster.find((a) => a.agent_key === run.agent_key);
    const { data: room } = await s.from("ao_rooms").select("*").eq("id", run.room_id).maybeSingle();
    if (!agent || !room) { await s.from("ao_agent_runs").delete().eq("id", run.id); continue; }

    try {
      const turn = await agentTurn(room, agent, roster);
      await s.from("ao_agent_runs").delete().eq("id", run.id);
      spoken.push(run.agent_key);
      if (!turn.resolved && run.depth < MAX_HANDOFFS) {
        for (const m of turn.mentions) {
          if ((room.participants ?? []).includes(m)) {
            await enqueueRun(room.id, m, "handoff from " + run.agent_key, run.depth + 1);
          }
        }
      }
    } catch (e) {
      const msg = ((e as Error)?.message ?? String(e)).slice(0, 500);
      const dead = run.attempts >= run.max_attempts;
      await s.from("ao_agent_runs").update({
        status: dead ? "failed" : "pending",
        last_error: msg,
        lease_until: null,
        next_run_at: new Date(Date.now() + Math.min(60_000, 3000 * run.attempts)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", run.id);
      await post(run.room_id, {
        speaker: "system", role: "system", kind: "system",
        content: dead
          ? "⚠️ " + run.agent_key + " could not complete after " + run.attempts + " attempts: " + msg
          : "↻ " + run.agent_key + " hit an error (" + msg + ") — retrying automatically (attempt " +
            run.attempts + "/" + run.max_attempts + ").",
      });
      if (dead) spoken.push(run.agent_key + ":failed");
    }
  }
  return spoken;
}


/** Pick who answers a human message: explicit mentions, else facilitator, else the only agent. */
function firstResponders(room: any, text: string, roster: Agent[]): string[] {
  const keys = roster.map((a) => a.agent_key);
  const mentioned = mentionsIn(text, keys).filter((k) => room.participants.includes(k));
  if (mentioned.length) return mentioned;
  if (room.participants.length === 1) return [room.participants[0]];
  const fac = room.facilitator && room.participants.includes(room.facilitator)
    ? room.facilitator
    : room.participants[0];
  return fac ? [fac] : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "rooms");
    const roster = await loadAgents();

    if (action === "agents") return json({ ok: true, agents: roster });

    // Live war-room feed: roster + heartbeats + delegations + inter-agent chatter
    if (action === "warroom") {
      const s = sb();
      const [beats, dels, chatter, rooms] = await Promise.all([
        s.from("war_room_heartbeats").select("*").order("last_beat_at", { ascending: false }).limit(40),
        s.from("ao_delegations").select("id,from_agent,to_agent,directive,status,attempts,result,created_at")
          .order("created_at", { ascending: false }).limit(40),
        s.from("ao_room_messages").select("id,room_id,speaker,role,content,mentions,kind,created_at")
          .neq("role", "human").order("created_at", { ascending: false }).limit(60),
        s.from("ao_rooms").select("id,title,participants,status,updated_at")
          .order("updated_at", { ascending: false }).limit(30),
      ]);
      return json({
        ok: true,
        agents: roster,
        heartbeats: beats.data ?? [],
        delegations: dels.data ?? [],
        chatter: chatter.data ?? [],
        rooms: rooms.data ?? [],
      });
    }


    if (action === "rooms") {
      const { data } = await sb().from("ao_rooms").select("*").order("updated_at", { ascending: false }).limit(60);
      return json({ ok: true, rooms: data ?? [] });
    }

    if (action === "create") {
      const participants: string[] = (body.participants ?? []).map(String)
        .filter((p: string) => roster.some((a) => a.agent_key === p));
      if (!participants.length) return json({ ok: false, error: "pick at least one agent" }, 400);
      const { data, error } = await sb().from("ao_rooms").insert({
        title: String(body.title ?? "Untitled room").slice(0, 160),
        goal: String(body.goal ?? "").slice(0, 2000),
        participants,
        facilitator: body.facilitator && participants.includes(String(body.facilitator))
          ? String(body.facilitator)
          : participants[0],
        mode: body.mode === "full" ? "full" : "safe",
      }).select().single();
      if (error) return json({ ok: false, error: error.message }, 400);
      await post(data.id, {
        speaker: "system",
        role: "system",
        content: "Room opened. Participants: " + participants.join(", ") +
          (data.goal ? ". Goal: " + data.goal : ""),
        kind: "system",
      });
      return json({ ok: true, room: data });
    }

    if (action === "history") {
      const roomId = String(body.room_id ?? "");
      const { data: room } = await sb().from("ao_rooms").select("*").eq("id", roomId).maybeSingle();
      if (!room) return json({ ok: false, error: "room not found" }, 404);
      const { data } = await sb().from("ao_room_messages").select("*")
        .eq("room_id", roomId).order("created_at", { ascending: true }).limit(400);
      return json({ ok: true, room, messages: data ?? [] });
    }

    if (action === "invite") {
      const roomId = String(body.room_id ?? "");
      const { data: room } = await sb().from("ao_rooms").select("*").eq("id", roomId).maybeSingle();
      if (!room) return json({ ok: false, error: "room not found" }, 404);
      const add = (body.participants ?? []).map(String).filter((p: string) => roster.some((a) => a.agent_key === p));
      const participants = [...new Set([...(room.participants ?? []), ...add])];
      await sb().from("ao_rooms").update({ participants }).eq("id", roomId);
      await post(roomId, {
        speaker: "system", role: "system", kind: "system",
        content: "Invited: " + add.join(", "),
      });
      return json({ ok: true, participants });
    }

    // Human speaks. Work is DURABLE: every reply owed becomes a queued run, so
    // if this isolate dies mid-thought the 24/7 runner picks the work back up.
    if (action === "say") {
      const roomId = String(body.room_id ?? "");
      const text = String(body.text ?? "").trim();
      if (!text) return json({ ok: false, error: "text required" }, 400);
      const { data: room } = await sb().from("ao_rooms").select("*").eq("id", roomId).maybeSingle();
      if (!room) return json({ ok: false, error: "room not found" }, 404);

      await post(roomId, {
        speaker: "human", role: "human", kind: "message", content: text,
        mentions: mentionsIn(text, roster.map((a) => a.agent_key)),
      });

      const responders = firstResponders(room, text, roster);
      for (const key of responders) await enqueueRun(roomId, key, "operator message", 0);

      // Best effort: work the queue inline while the operator waits, then leave
      // whatever is left to the durable tick.
      const spoken = await drainRuns(roster, { roomId, budgetMs: 45_000, limit: MAX_HANDOFFS });

      const { data } = await sb().from("ao_room_messages").select("*")
        .eq("room_id", roomId).order("created_at", { ascending: true }).limit(400);
      const { count: pending } = await sb().from("ao_agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId).in("status", ["pending", "running"]);
      return json({ ok: true, spoke: spoken, pending: pending ?? 0, messages: data ?? [] });
    }

    // Durable worker: called by the 24/7 runner every minute (and by the UI while
    // a room still has work). Resumes any run whose lease expired or that failed.
    if (action === "tick") {
      const spoken = await drainRuns(roster, {
        roomId: body.room_id ? String(body.room_id) : undefined,
        budgetMs: Math.min(Number(body.budget_ms ?? 45_000), 55_000),
        limit: Math.min(Number(body.limit ?? 4), 10),
      });
      const { count: pending } = await sb().from("ao_agent_runs")
        .select("id", { count: "exact", head: true }).in("status", ["pending", "running"]);
      let messages: unknown[] | undefined;
      if (body.room_id) {
        const { data } = await sb().from("ao_room_messages").select("*")
          .eq("room_id", String(body.room_id)).order("created_at", { ascending: true }).limit(400);
        messages = data ?? [];
      }
      return json({ ok: true, spoke: spoken, pending: pending ?? 0, messages });
    }


    // Agents converse among themselves toward the goal — no human in the loop.
    if (action === "converse") {
      const roomId = String(body.room_id ?? "");
      const rounds = Math.min(Math.max(Number(body.rounds ?? 2), 1), 6);
      const { data: room } = await sb().from("ao_rooms").select("*").eq("id", roomId).maybeSingle();
      if (!room) return json({ ok: false, error: "room not found" }, 404);
      const participants: string[] = room.participants ?? [];
      if (!participants.length) return json({ ok: false, error: "no participants" }, 400);

      let resolved = false;
      for (let r = 0; r < rounds && !resolved; r++) {
        for (const key of participants) {
          const agent = roster.find((a) => a.agent_key === key);
          if (!agent) continue;
          const turn = await agentTurn(room, agent, roster);
          if (turn.resolved) { resolved = true; break; }
        }
      }

      // Facilitator closes the round with a decision summary.
      const facKey = room.facilitator ?? participants[0];
      const fac = roster.find((a) => a.agent_key === facKey);
      if (fac && !resolved) {
        const msgs = await history(roomId);
        try {
          const res = await llmDetailed(
            "You are " + fac.display_name + ", facilitating this room. Summarize the dialogue as a DECISION LOG: " +
            "what was agreed, what is still open, and the next concrete action with an owner. " +
            'Reply as JSON: { "say": "..." }. Max 6 short lines. No praise, no restating.',
            transcriptFor(msgs, fac.agent_key),
            (await resolveAgentModel(fac.agent_key, fac.model)) || DEFAULT_MODEL,
            { temperature: 0.3, max_tokens: 400 },
          );
          const summary = String(safeParse(res.content).say ?? "").trim();
          if (summary) {
            await post(roomId, {
              speaker: fac.agent_key, role: "agent", kind: "summary",
              content: summary, model: res.model,
            });
          }
        } catch (_e) { /* summary is best-effort */ }
      }

      const { data } = await sb().from("ao_room_messages").select("*")
        .eq("room_id", roomId).order("created_at", { ascending: true }).limit(400);
      return json({ ok: true, rounds, resolved, messages: data ?? [] });
    }

    if (action === "close") {
      const roomId = String(body.room_id ?? "");
      await sb().from("ao_rooms").update({
        status: String(body.status ?? "resolved"),
        resolution: String(body.resolution ?? "").slice(0, 400) || null,
      }).eq("id", roomId);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown action " + action }, 400);
  } catch (e) {
    console.error("dialogue-room error", e);
    return json({ ok: false, error: (e as Error)?.message ?? String(e) }, 500);
  }
});
