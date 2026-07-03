// Azure AI Foundry Agent Service bridge — NEW Responses/Conversations API.
// Runs prompt-style agents (plain names like "BUILDEROFAGENTS") via:
//   POST /openai/v1/conversations         (create conversation, once per channel+external_id+agent)
//   POST /openai/v1/responses             (create response, submit tool outputs on next call)
// Executes locally-implemented function tools (vapi_*, war_room_post, war_room_heartbeat)
// and returns the final assistant text.
//
// POST { agentName, message, channel?, externalId? } -> { ok, text, steps, conversationId }

import { createClient } from "npm:@supabase/supabase-js@2";
import { ROSTER } from "../_shared/agent-roster.ts";
import { AZURE_TOOL_NAMES, executeAzureTool } from "../_shared/azure-tools.ts";

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
const EXTRA_ALLOWED_AGENTS = new Set(["internal-app-test-buildrunner"]);

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
  // Responses/Conversations API paths already include /openai/v1; no api-version query needed there,
  // but harmless. For /agents management surface, api-version=v1 is required.
  const needsApiVer = !path.includes("/openai/v1/");
  const url = AI_PROJECT + path + (needsApiVer ? (path.includes("?") ? "&" : "?") + "api-version=v1" : "");
  const t = await tok();
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + t,
      "content-type": "application/json",
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

async function execLocalTool(name: string, args: any, ctx: { agentName: string }): Promise<unknown> {
  if (AZURE_TOOL_NAMES.includes(name as any)) return executeAzureTool(name, args ?? {});
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

async function ensureConversation(agentName: string, channel: string, externalId: string): Promise<string> {
  const { data } = await sb.from("azure_agent_threads")
    .select("thread_id")
    .eq("channel", channel).eq("external_id", externalId).eq("assistant_id", agentName)
    .maybeSingle();
  if (data?.thread_id) return data.thread_id;
  const c = await az("POST", "/openai/v1/conversations", {});
  await sb.from("azure_agent_threads").insert({
    channel, external_id: externalId, assistant_id: agentName, thread_id: c.id,
  });
  return c.id;
}

// Extract assistant text + function_call items from a Response object.
function parseResponse(resp: any) {
  const items: any[] = Array.isArray(resp?.output) ? resp.output : [];
  const functionCalls: { call_id: string; name: string; arguments: string }[] = [];
  const textParts: string[] = [];
  for (const it of items) {
    if (it?.type === "function_call") {
      functionCalls.push({ call_id: it.call_id, name: it.name, arguments: it.arguments ?? "{}" });
    } else if (it?.type === "message") {
      const c = Array.isArray(it.content) ? it.content : [];
      for (const p of c) {
        if (p?.type === "output_text" && typeof p.text === "string") textParts.push(p.text);
        else if (typeof p?.text === "string") textParts.push(p.text);
      }
    }
  }
  // Convenience: some responses expose output_text directly.
  if (!textParts.length && typeof resp?.output_text === "string") textParts.push(resp.output_text);
  return { text: textParts.join("\n").trim(), functionCalls };
}

async function runOnce(agentName: string, conversationId: string, userMessage: string) {
  const agentRef = { type: "agent_reference", name: agentName };
  const steps: any[] = [];
  const started = Date.now();

  let resp = await az("POST", "/openai/v1/responses", {
    agent_reference: agentRef,
    conversation: conversationId,
    input: [{ role: "user", content: userMessage }],
  });

  for (let hop = 0; hop < 10; hop++) {
    if (Date.now() - started > 110_000) throw new Error("run timeout");
    const { text, functionCalls } = parseResponse(resp);
    if (functionCalls.length === 0) {
      return { text, steps, conversationId, responseId: resp?.id };
    }
    // Execute tools locally, then submit outputs as a follow-up response.
    const outputs: any[] = [];
    for (const fc of functionCalls) {
      let args: any = {};
      try { args = JSON.parse(fc.arguments || "{}"); } catch { /* keep */ }
      let result: unknown;
      try { result = await execLocalTool(fc.name, args, { agentName }); }
      catch (e) { result = { error: (e as Error).message }; }
      steps.push({ tool: fc.name, args, result });
      outputs.push({
        type: "function_call_output",
        call_id: fc.call_id,
        output: typeof result === "string" ? result : JSON.stringify(result),
      });
    }
    resp = await az("POST", "/openai/v1/responses", {
      agent_reference: agentRef,
      conversation: conversationId,
      input: outputs,
    });
  }
  throw new Error("tool loop exceeded 10 hops");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const t0 = Date.now();
  let runRow: string | null = null;
  let agentName = "", message = "", channel = "war-room", externalId = "war-room", source = "unknown";
  try {
    const body = await req.json();
    agentName = String(body.agentName ?? "").trim();
    message = String(body.message ?? "").trim();
    channel = String(body.channel ?? "war-room");
    externalId = String(body.externalId ?? "war-room");
    source = String(body.source ?? "unknown");
    if (!agentName) return j({ ok: false, error: "agentName required" }, 400);
    if (!ROSTER[agentName] && !EXTRA_ALLOWED_AGENTS.has(agentName)) {
      return j({ ok: false, error: "unknown agent: " + agentName }, 400);
    }
    if (!message) return j({ ok: false, error: "message required" }, 400);

    const ins = await sb.from("foundry_runs").insert({
      agent_name: agentName, source, channel, external_id: externalId,
      request_message: message.slice(0, 4000), status: "started",
    }).select("id").single();
    runRow = ins.data?.id ?? null;

    const conversationId = await ensureConversation(agentName, channel, externalId);
    const out = await runOnce(agentName, conversationId, message);

    if (runRow) {
      await sb.from("foundry_runs").update({
        conversation_id: conversationId,
        response_id: out.responseId,
        final_text: (out.text ?? "").slice(0, 4000),
        steps: out.steps,
        status: "completed",
        ended_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      }).eq("id", runRow);
    }
    return j({ ok: true, text: out.text, steps: out.steps, conversationId, responseId: out.responseId, agentName, runId: runRow });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("foundry-agent-run:", msg);
    if (runRow) {
      await sb.from("foundry_runs").update({
        status: "failed", error: msg.slice(0, 4000),
        ended_at: new Date().toISOString(), duration_ms: Date.now() - t0,
      }).eq("id", runRow);
    }
    return j({ ok: false, error: msg, runId: runRow }, 500);
  }
});

function j(p: unknown, s = 200) { return new Response(JSON.stringify(p), { status: s, headers: { ...cors, "content-type": "application/json" } }); }
