// Agent Rooms: runs a Foundry Workflow Agent (builder-orchestrator or shopper-orchestrator)
// via the Responses API and streams every sub-agent turn into public.agent_room_messages.
//
// POST { room: "builders"|"shoppers", message: string, roomId?: string }
// -> { ok, roomId, responseId, messages: [{agent_name, role, content}] }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const AI_PROJECT = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SVC);

const ORCHESTRATORS: Record<string, string> = {
  builders: "builder-orchestrator",
  shoppers: "shopper-orchestrator",
};

let cachedToken: { token: string; exp: number } | null = null;
async function aiToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://ai.azure.com/.default",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("azure token: " + JSON.stringify(j));
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cachedToken.token;
}

// Raw call — path is appended verbatim, no api-version query is added.
async function azRaw(method: string, path: string, body?: unknown) {
  const url = AI_PROJECT + path;
  const tok = await aiToken();
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + tok,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* raw */ }
  if (!r.ok) {
    throw new Error("azure " + r.status + " " + method + " " + path + ": " + (typeof data === "string" ? data : JSON.stringify(data)));
  }
  return data;
}

// Walk any Responses-API output shape and pull out agent-tagged text turns.
function extractTurns(resp: any): { agent_name: string; role: string; content: string; meta: any }[] {
  const out: { agent_name: string; role: string; content: string; meta: any }[] = [];
  const output = resp?.output ?? resp?.outputs ?? [];
  const arr = Array.isArray(output) ? output : [output];
  for (const item of arr) {
    if (!item) continue;
    // Standard message item
    if (item.type === "message" || item.object === "message") {
      const agent = item.agent_name ?? item.assistant_name ?? item.agent?.name ?? item.author?.name ?? "assistant";
      let text = "";
      const content = item.content ?? [];
      const parts = Array.isArray(content) ? content : [content];
      for (const c of parts) {
        if (typeof c === "string") text += c;
        else if (c?.type === "output_text" || c?.type === "text") text += (c.text?.value ?? c.text ?? "");
      }
      if (text.trim()) out.push({ agent_name: String(agent), role: item.role ?? "assistant", content: text, meta: { item_id: item.id, type: item.type } });
    }
    // Tool call item
    else if (item.type?.includes?.("tool") || item.type === "function_call" || item.type === "browser_automation_call") {
      out.push({
        agent_name: item.agent_name ?? "tool",
        role: "tool",
        content: `[${item.type}] ${item.name ?? item.function?.name ?? ""} ${JSON.stringify(item.arguments ?? item.function?.arguments ?? {}).slice(0, 500)}`,
        meta: item,
      });
    }
    // Nested/step wrapper
    else if (item.output || item.outputs || item.steps) {
      out.push(...extractTurns(item));
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { room, message, roomId } = await req.json();
    const orch = ORCHESTRATORS[String(room)];
    if (!orch) return json({ ok: false, error: "room must be 'builders' or 'shoppers'" }, 400);
    const text = String(message ?? "").trim();
    if (!text) return json({ ok: false, error: "message required" }, 400);

    // Get or create room row
    let rid = roomId as string | undefined;
    if (!rid) {
      const { data, error } = await sb.from("agent_rooms").insert({
        room, title: text.slice(0, 80),
      }).select("id").single();
      if (error) throw error;
      rid = data.id;
    }

    // Log the human message
    await sb.from("agent_room_messages").insert({
      room_id: rid, agent_name: "You", role: "user", content: text,
    });

    // Fire the workflow agent via Foundry Responses API (per-agent endpoint)
    const body: any = {
      input: [{ role: "user", content: text }],
    };
    // Reuse previous_response_id for continuity
    const { data: last } = await sb.from("agent_rooms").select("azure_response_id").eq("id", rid).maybeSingle();
    if (last?.azure_response_id) body.previous_response_id = last.azure_response_id;

    let resp: any;
    try {
      resp = await az("POST", "/agents/" + encodeURIComponent(orch) + "/responses", body);
    } catch (e) {
      const err = (e as Error).message;
      await sb.from("agent_room_messages").insert({
        room_id: rid, agent_name: "system", role: "error", content: err,
      });
      return json({ ok: false, roomId: rid, error: err }, 500);
    }

    const turns = extractTurns(resp);
    if (turns.length === 0 && resp?.output_text) {
      turns.push({ agent_name: orch, role: "assistant", content: resp.output_text, meta: {} });
    }

    if (turns.length > 0) {
      await sb.from("agent_room_messages").insert(
        turns.map((t) => ({ room_id: rid, ...t })),
      );
    }

    await sb.from("agent_rooms").update({
      azure_response_id: resp?.id ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", rid);

    return json({ ok: true, roomId: rid, responseId: resp?.id, messages: turns, raw_status: resp?.status });
  } catch (e) {
    console.error("agent-room-run error:", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}
