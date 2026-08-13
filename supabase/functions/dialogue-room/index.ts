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
  DEFAULT_MODEL,
  type Mode,
} from "../_shared/lobe-runtime.ts";

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

function transcriptFor(msgs: Msg[], self: string) {
  return msgs.slice(-HISTORY_WINDOW).map((m) => {
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
    "- EVIDENCE RULE: never state a number, status or fact about this business from memory. Read it with a tool first (db_read) or say plainly that you have not checked.",
    "- NO ECHO: never repeat, rephrase or agree with what a peer just said. Add something new or stay short.",
    "- If you need something from the operator (a decision, a credential, an approval), ask for exactly that.",
    "",
    "TOOLS (optional, use only when it materially helps): " + (allowed.join(", ") || "none") +
      ". Mode: " + room.mode + (room.mode === "safe" ? " (writes blocked)" : " (writes allowed)") + ".",
    "",
    "Reply with ONE JSON object:",
    '{ "say": "your message", "mentions": ["agent_key", ...], "tool": {"name":"...","args":{...}} | null, "resolved": false, "resolution": "" }',
    "Set resolved=true only when the room's goal is genuinely achieved, with a one-line resolution.",
  ].join("\n");
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

  // Up to two tool hops, then the agent must speak.
  for (let hop = 0; hop < 3; hop++) {
    const convo = transcriptFor(msgs, agent.agent_key);
    if (toolCalls.length) {
      convo.push({
        role: "user",
        content: "TOOL RESULTS so far: " + JSON.stringify(toolCalls).slice(0, 2500) +
          "\nNow reply to the room in `say` (tool: null) unless one more call is essential.",
      });
    }
    let out = "{}";
    try {
      const res = await llmDetailed(sys, convo, agent.model || DEFAULT_MODEL, { temperature: 0.6, max_tokens: 700 });
      out = res.content;
      usedModel = res.model;
    } catch (e) {
      say = "(" + agent.agent_key + " could not reach a model: " + ((e as Error)?.message ?? "error") + ")";
      break;
    }
    const parsed = safeParse(out);
    say = String(parsed.say ?? "").trim();
    mentions = Array.isArray(parsed.mentions)
      ? parsed.mentions.map(String).filter((m: string) => roster_keys.includes(m))
      : [];
    resolved = Boolean(parsed.resolved);
    resolution = String(parsed.resolution ?? "").slice(0, 400);

    const tool = parsed.tool;
    if (tool && tool.name && hop < 2) {
      const r = await execTool(String(tool.name), tool.args ?? {}, allowed, mode);
      toolCalls.push({ name: tool.name, args: tool.args ?? {}, ok: r.ok, result: r.result, error: r.error });
      if (say) break;      // spoke and acted in one turn
      continue;            // acted silently — go get the spoken reply
    }
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

    // Human speaks. Responders answer, and each @mention cascades a real handoff.
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

      let queue = firstResponders(room, text, roster);
      const spoken: string[] = [];
      for (let i = 0; i < MAX_HANDOFFS && queue.length; i++) {
        const key = queue.shift()!;
        const agent = roster.find((a) => a.agent_key === key);
        if (!agent) continue;
        const turn = await agentTurn(room, agent, roster);
        spoken.push(key);
        if (turn.resolved) break;
        for (const m of turn.mentions) {
          if (!spoken.includes(m) && !queue.includes(m) && room.participants.includes(m)) queue.push(m);
        }
      }
      const { data } = await sb().from("ao_room_messages").select("*")
        .eq("room_id", roomId).order("created_at", { ascending: true }).limit(400);
      return json({ ok: true, spoke: spoken, messages: data ?? [] });
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
            fac.model || DEFAULT_MODEL,
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
