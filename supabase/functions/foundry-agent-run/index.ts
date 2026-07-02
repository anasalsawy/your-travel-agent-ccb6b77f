// Generic Azure AI Foundry Agent runtime bridge.
// Runs ANY agent in the ROSTER by name (shopper/builder/etc), using the /agents +
// /threads + /threads/{id}/runs surface. Executes any locally-implemented function
// tools (vapi_*, war_room_post) and returns the final assistant text.
//
// POST { agentName, message, channel?, externalId? } -> { ok, text, steps, threadId }

import { createClient } from "npm:@supabase/supabase-js@2";
import { ROSTER } from "../_shared/agent-roster.ts";

const cors = {
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
const FN_URL = SB_URL + "/functions/v1";
const sb = createClient(SB_URL, SVC);

let tokCache: { token: string; exp: number } | null = null;
async function tok() {
  const now = Math.floor(Date.now() / 1000);
  if (tokCache && tokCache.exp - 60 > now) return tokCache.token;
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      scope: "https://ai.azure.com/.default",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("azure token: " + JSON.stringify(j));
  tokCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return tokCache.token;
}

async function az(method: string, path: string, body?: unknown) {
  if (!AI_PROJECT) throw new Error("AZURE_AI_PROJECT_ENDPOINT not set");
  const url = AI_PROJECT + path + (path.includes("?") ? "&" : "?") + "api-version=v1";
  const t = await tok();
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + t,
      "content-type": "application/json",
      "x-ms-enable-preview": "true",
      "Foundry-Features": "WorkflowAgents=V1Preview",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = text; try { data = JSON.parse(text); } catch { /* raw */ }
  if (!r.ok) throw new Error("azure " + r.status + " " + method + " " + path + ": " + (typeof data === "object" ? JSON.stringify(data) : text));
  return data;
}

async function callFn(name: string, payload: unknown) {
  const r = await fetch(FN_URL + "/" + name, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + SVC },
    body: JSON.stringify(payload),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}

// Locally-implemented function tools (mirrors the tool declarations
// applied to Foundry agents by azure-agents-v1 apply-roster).
async function execLocalTool(name: string, args: any, ctx: { agentName: string }): Promise<unknown> {
  switch (name) {
    case "vapi_call":    return callFn("vapi-call", args);
    case "vapi_inject":  return callFn("vapi-inject", args);
    case "vapi_hangup":  return callFn("vapi-hangup", args);
    case "vapi_status":  return callFn("vapi-status", args);
    case "war_room_post": {
      const { content, addressed_to, status } = args ?? {};
      await sb.from("war_room_messages").insert({
        agent_name: ctx.agentName,
        role: "assistant",
        content: String(content ?? "").slice(0, 4000),
        addressed_to: Array.isArray(addressed_to) ? addressed_to : [],
        meta: { via: "tool", status: status ?? null },
      });
      await sb.from("war_room_heartbeats").upsert({
        agent_name: ctx.agentName,
        status_line: String(content ?? "").slice(0, 120),
        mood: status ?? "working",
        last_beat_at: new Date().toISOString(),
      });
      return { ok: true };
    }
    case "war_room_heartbeat": {
      await sb.from("war_room_heartbeats").upsert({
        agent_name: ctx.agentName,
        status_line: String(args?.status_line ?? "alive").slice(0, 120),
        mood: args?.mood ?? "ready",
        current_task_id: args?.current_task_id ?? null,
        last_beat_at: new Date().toISOString(),
      });
      return { ok: true };
    }
    default:
      return { __unhandled: true, name };
  }
}

async function resolveAgentId(agentName: string): Promise<string> {
  // Try direct GET by name (Foundry accepts name-or-id in some routes); fall back to list.
  try {
    const g = await az("GET", "/agents/" + encodeURIComponent(agentName));
    if (g?.id) return g.id;
    if (g?.name) return g.name;
  } catch { /* fall through */ }
  const list = await az("GET", "/agents");
  const items = Array.isArray(list) ? list : (list?.data ?? list?.value ?? []);
  const hit = items.find((a: any) => a?.name === agentName || a?.id === agentName);
  if (!hit) throw new Error("agent not found in Foundry: " + agentName);
  return hit.id ?? hit.name;
}

async function ensureThread(agentName: string, channel: string, externalId: string, agentId: string): Promise<string> {
  const { data } = await sb.from("azure_agent_threads")
    .select("thread_id")
    .eq("channel", channel).eq("external_id", externalId).eq("assistant_id", agentId)
    .maybeSingle();
  if (data?.thread_id) return data.thread_id;
  const t = await az("POST", "/threads", {});
  await sb.from("azure_agent_threads").insert({
    channel, external_id: externalId, assistant_id: agentId, thread_id: t.id,
  });
  return t.id;
}

async function runOnce(agentName: string, agentId: string, threadId: string, userMessage: string) {
  await az("POST", "/threads/" + threadId + "/messages", { role: "user", content: userMessage });
  let run = await az("POST", "/threads/" + threadId + "/runs", { assistant_id: agentId });
  const steps: any[] = [];
  const started = Date.now();
  while (true) {
    if (Date.now() - started > 110_000) throw new Error("run timeout");
    if (run.status === "completed") break;
    if (["failed", "cancelled", "expired"].includes(run.status)) {
      throw new Error("run " + run.status + ": " + JSON.stringify(run.last_error ?? {}));
    }
    if (run.status === "requires_action" && run.required_action?.type === "submit_tool_outputs") {
      const calls = run.required_action.submit_tool_outputs.tool_calls ?? [];
      const outputs: { tool_call_id: string; output: string }[] = [];
      for (const c of calls) {
        const name = c.function?.name;
        let args: any = {};
        try { args = JSON.parse(c.function?.arguments ?? "{}"); } catch { /* keep */ }
        let result: unknown;
        try { result = await execLocalTool(name, args, { agentName }); }
        catch (e) { result = { error: (e as Error).message }; }
        steps.push({ tool: name, args, result });
        outputs.push({ tool_call_id: c.id, output: JSON.stringify(result) });
      }
      run = await az("POST", "/threads/" + threadId + "/runs/" + run.id + "/submit_tool_outputs", { tool_outputs: outputs });
      continue;
    }
    await new Promise((r) => setTimeout(r, 700));
    run = await az("GET", "/threads/" + threadId + "/runs/" + run.id);
  }
  const msgs = await az("GET", "/threads/" + threadId + "/messages?limit=1&order=desc");
  const latest = msgs.data?.[0];
  let text = "";
  if (Array.isArray(latest?.content)) {
    text = latest.content.map((c: any) => c?.type === "text" ? (c.text?.value ?? "") : "").filter(Boolean).join("\n");
  }
  return { text, steps, threadId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const agentName = String(body.agentName ?? "").trim();
    const message = String(body.message ?? "").trim();
    const channel = String(body.channel ?? "war-room");
    const externalId = String(body.externalId ?? "war-room");
    if (!agentName) return j({ ok: false, error: "agentName required" }, 400);
    if (!ROSTER[agentName]) return j({ ok: false, error: "unknown agent: " + agentName }, 400);
    if (!message) return j({ ok: false, error: "message required" }, 400);

    const agentId = await resolveAgentId(agentName);
    const threadId = await ensureThread(agentName, channel, externalId, agentId);
    const out = await runOnce(agentName, agentId, threadId, message);
    return j({ ok: true, text: out.text, steps: out.steps, threadId, agentId, agentName });
  } catch (e) {
    console.error("foundry-agent-run:", e);
    return j({ ok: false, error: (e as Error).message }, 500);
  }
});

function j(p: unknown, s = 200) { return new Response(JSON.stringify(p), { status: s, headers: { ...cors, "content-type": "application/json" } }); }
