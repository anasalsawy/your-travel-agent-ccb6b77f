// foundry-connections — safe, backup-first management of Azure AI Foundry
// project connections used by BUILDEROFAGENTS.
//
// Actions (POST { action, ... }):
//  - backup                 : snapshot BUILDEROFAGENTS agent def + all project connections into DB
//  - list-connections       : return raw connections list (from control-plane REST)
//  - list-agent-tools       : return current tools/connections on BUILDEROFAGENTS
//  - probe-current          : run SP against each Builder-attached connection, log results
//  - patch-builder          : rewrite Builder tools[] to a provided replacement set (backup taken first)
//  - probe-after            : re-run probe against the CURRENT Builder, log as phase=after
//
// Guardrails:
//  - Never deletes a connection.
//  - Every patch backs up the previous agent version first.
//  - Every mutation returns the DB backup row id so a rollback is possible.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AZURE_FUNCTION_TOOLS, AZURE_TOOL_NAMES } from "../_shared/azure-tools.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const AI_PROJECT = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
const ARM_SUB = Deno.env.get("AZURE_SUBSCRIPTION_ID") ?? "";
const ARM_RG  = Deno.env.get("AZURE_RESOURCE_GROUP") ?? "";
const ARM_ACCOUNT = Deno.env.get("AZURE_AI_ACCOUNT_NAME") ?? "";
const ARM_PROJECT = Deno.env.get("AZURE_AI_PROJECT_NAME") ?? "";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SB_URL, SVC);

const BUILDER = "BUILDEROFAGENTS";

function agentNameFrom(body: Record<string, unknown>): string {
  const n = String(body.agentName ?? body.agent_name ?? BUILDER).trim();
  return n || BUILDER;
}

// --- Auth tokens for two scopes: AI data plane + ARM control plane. ---
const tokCache: Record<string, { token: string; exp: number }> = {};
async function tokFor(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokCache[scope] && tokCache[scope].exp - 60 > now) return tokCache[scope].token;
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("azure token (" + scope + "): " + JSON.stringify(j));
  tokCache[scope] = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}
const aiTok  = () => tokFor("https://ai.azure.com/.default");
const armTok = () => tokFor("https://management.azure.com/.default");

async function az(method: string, path: string, body?: unknown) {
  const needsApiVer = !path.includes("/openai/v1/");
  const url = AI_PROJECT + path + (needsApiVer ? (path.includes("?") ? "&" : "?") + "api-version=v1" : "");
  const t = await aiTok();
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let d: any = txt; try { d = JSON.parse(txt); } catch { /* raw */ }
  return { status: r.status, ok: r.ok, data: d };
}

async function arm(method: string, path: string, body?: unknown, apiVersion = "2025-06-01") {
  const url = "https://management.azure.com" + path
    + (path.includes("?") ? "&" : "?") + "api-version=" + apiVersion;
  const t = await armTok();
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let d: any = txt; try { d = JSON.parse(txt); } catch { /* raw */ }
  return { status: r.status, ok: r.ok, data: d };
}

// ARM connections path for a Foundry (Cognitive Services) account project.
function armProjectConnectionsBase(): string | null {
  if (!ARM_SUB || !ARM_RG || !ARM_ACCOUNT || !ARM_PROJECT) return null;
  return "/subscriptions/" + ARM_SUB
    + "/resourceGroups/" + ARM_RG
    + "/providers/Microsoft.CognitiveServices/accounts/" + ARM_ACCOUNT
    + "/projects/" + ARM_PROJECT
    + "/connections";
}

// ---- Handlers ----

async function backupAll(label: string, agentName = BUILDER) {
  const rows: any[] = [];
  // 1. Agent definition (full, with all versions if returned)
  const ag = await az("GET", "/agents/" + agentName);
  const b1 = await sb.from("foundry_connection_backups").insert({
    label, scope: "agent", agent_name: agentName, payload: ag.data,
  }).select("id").single();
  rows.push({ scope: "agent", id: b1.data?.id, status: ag.status });

  // 2. Project connections (ARM)
  const cbase = armProjectConnectionsBase();
  if (cbase) {
    const cx = await arm("GET", cbase);
    const b2 = await sb.from("foundry_connection_backups").insert({
      label, scope: "connections", agent_name: null, payload: cx.data,
    }).select("id").single();
    rows.push({ scope: "connections", id: b2.data?.id, status: cx.status });
  } else {
    rows.push({ scope: "connections", skipped: "ARM env vars not set (AZURE_SUBSCRIPTION_ID/RESOURCE_GROUP/AI_ACCOUNT_NAME/AI_PROJECT_NAME)" });
  }
  return rows;
}

function summarizeBuilderTools(agent: any) {
  const dfn = agent?.versions?.latest?.definition ?? {};
  const tools = Array.isArray(dfn.tools) ? dfn.tools : [];
  return tools.map((t: any) => ({
    type: t?.type ?? t?.kind ?? "?",
    name: t?.name ?? t?.function?.name ?? null,
    connection_id: t?.mcp?.connection_id ?? t?.browser?.connection_id ?? t?.grounding_bing?.connection_id ?? t?.connection_id ?? null,
    server_label: t?.mcp?.server_label ?? null,
    raw: t,
  }));
}

async function probeCurrent(phase: "before" | "after", agentName = BUILDER) {
  const agent = await az("GET", "/agents/" + agentName);
  const tools = summarizeBuilderTools(agent.data);
  const results: any[] = [];
  // Only pings we can safely do under SP: create a single Response with the
  // Builder + a trivial prompt that FORCES it to attempt each tool if possible.
  // We probe generically by running one conversation turn per tool "type" and
  // classifying the error surface.
  for (const t of tools) {
    if (t.type === "function") continue; // local functions handled by bridge
    const prompt = "SP-CONNECTION-PROBE: try tool of type '" + t.type + "'"
      + (t.name ? " name '" + t.name + "'" : "")
      + (t.server_label ? " server_label '" + t.server_label + "'" : "")
      + ". Reply only with the raw tool result or a one-line error.";
    // Create a fresh conversation each time so state can't cross-contaminate.
    const conv = await az("POST", "/openai/v1/conversations", {});
    const convId = conv?.data?.id ?? null;
    const resp = await az("POST", "/openai/v1/responses", {
      agent_reference: { type: "agent_reference", name: agentName },
      conversation: convId,
      input: [{ role: "user", content: prompt }],
    });
    const errText = resp.ok ? null : (typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data));
    const isToolUserErr = !!errText && /tool_user_error|signed-in user/i.test(errText);
    const ok = resp.ok && !isToolUserErr;
    const row = {
      phase, agent_name: agentName,
      connection_name: t.server_label ?? t.name ?? t.connection_id ?? t.type,
      connection_type: t.type,
      auth_type: t.type === "mcp" ? "mcp-oauth-or-key" : (t.type === "browser" ? "browser-connection" : t.type),
      identity_used: "service-principal:" + CLIENT_ID,
      test_result: ok ? "ok" : (isToolUserErr ? "tool_user_error" : "http_" + resp.status),
      error: ok ? null : { status: resp.status, body: resp.data },
      raw: { tool: t, responseId: resp.data?.id ?? null, conversationId: convId },
    };
    await sb.from("foundry_connection_probes").insert(row);
    results.push({
      connection: row.connection_name,
      type: row.connection_type,
      identity: row.identity_used,
      result: row.test_result,
      response_id: resp.data?.id ?? null,
      conversation_id: convId,
    });
  }
  return { total: results.length, results };
}

async function patchAgent(agentName: string, newTools: any[], reason: string) {
  const before = await az("GET", "/agents/" + agentName);
  const back = await sb.from("foundry_connection_backups").insert({
    label: "pre-patch:" + reason, scope: "agent", agent_name: agentName, payload: before.data,
  }).select("id").single();

  const dfn = before.data?.versions?.latest?.definition ?? {};
  const newDef = { ...dfn, tools: newTools };
  const posted = await az("POST", "/agents/" + agentName + "/versions", { definition: newDef });
  return {
    agent_name: agentName,
    backup_id: back.data?.id,
    posted_status: posted.status,
    posted_version: posted.data?.version ?? null,
    posted_error: posted.ok ? null : posted.data,
  };
}

async function patchBuilder(newTools: any[], reason: string) {
  return patchAgent(BUILDER, newTools, reason);
}

async function makeAgentSpSafe(agentName: string) {
  const before = await az("GET", "/agents/" + agentName);
  const dfn = before.data?.versions?.latest?.definition ?? {};
  const existing = Array.isArray(dfn.tools) ? dfn.tools : [];
  const removed: string[] = [];
  const kept = existing.filter((t: any) => {
    if (t?.type === "mcp") {
      removed.push(t?.server_label ?? t?.mcp?.server_label ?? "mcp");
      return false;
    }
    if (t?.type === "browser_automation_preview" && agentName !== BUILDER) {
      removed.push("browser_automation_preview");
      return false;
    }
    const n = t?.name ?? t?.function?.name ?? null;
    if (t?.type === "function" && n && AZURE_TOOL_NAMES.includes(n)) return false;
    return true;
  });
  const newTools = agentName === BUILDER
    ? [...kept, ...AZURE_FUNCTION_TOOLS]
    : kept;
  const result = await patchAgent(agentName, newTools, "make-sp-safe:" + agentName);
  return { removed, kept_count: kept.length, added: agentName === BUILDER ? AZURE_TOOL_NAMES : [], new_total: newTools.length, ...result };
}

const WAR_ROOM_AGENTS = [
  "assistant", "YTA-ASSISTANT", "BUILDEROFAGENTS", "internal-app-test-buildrunner",
  "shopper-lead", "shopper-helper-1", "shopper-helper-2", "shopper-helper-3",
];

function j(p: unknown, s = 200) {
  return new Response(JSON.stringify(p, null, 2), { status: s, headers: { ...cors, "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    if (!AI_PROJECT) return j({ ok: false, error: "AZURE_AI_PROJECT_ENDPOINT not set" }, 500);

    switch (action) {
      case "backup": {
        const label = String(body.label ?? ("manual-" + new Date().toISOString()));
        const agent = agentNameFrom(body);
        return j({ ok: true, action, agent_name: agent, rows: await backupAll(label, agent) });
      }
      case "list-connections": {
        const cbase = armProjectConnectionsBase();
        if (!cbase) return j({ ok: false, error: "ARM env vars missing", needed: ["AZURE_SUBSCRIPTION_ID","AZURE_RESOURCE_GROUP","AZURE_AI_ACCOUNT_NAME","AZURE_AI_PROJECT_NAME"] }, 400);
        const cx = await arm("GET", cbase);
        return j({ ok: cx.ok, status: cx.status, connections: cx.data });
      }
      case "list-agent-tools": {
        const agent = agentNameFrom(body);
        const ag = await az("GET", "/agents/" + agent);
        return j({ ok: ag.ok, agent_name: agent, tools: summarizeBuilderTools(ag.data) });
      }
      case "probe-current": {
        const agent = agentNameFrom(body);
        await backupAll("pre-probe-" + new Date().toISOString(), agent);
        return j({ ok: true, agent_name: agent, ...(await probeCurrent("before", agent)) });
      }
      case "probe-after": {
        const agent = agentNameFrom(body);
        return j({ ok: true, agent_name: agent, ...(await probeCurrent("after", agent)) });
      }
      case "patch-builder": {
        if (!Array.isArray(body.tools)) return j({ ok: false, error: "tools[] required" }, 400);
        return j({ ok: true, ...(await patchBuilder(body.tools, String(body.reason ?? "unspecified"))) });
      }
      case "install-azure-tools": {
        // Non-destructive: keep every existing Builder tool, strip any prior
        // azure_* function tools (so we can re-run idempotently), then append
        // the current AZURE_FUNCTION_TOOLS set. Backup taken by patchBuilder.
        const before = await az("GET", "/agents/" + BUILDER);
        const dfn = before.data?.versions?.latest?.definition ?? {};
        const existing = Array.isArray(dfn.tools) ? dfn.tools : [];
        const kept = existing.filter((t: any) => {
          const n = t?.name ?? t?.function?.name ?? null;
          return !(t?.type === "function" && n && AZURE_TOOL_NAMES.includes(n));
        });
        const newTools = [...kept, ...AZURE_FUNCTION_TOOLS];
        const result = await patchBuilder(newTools, "install-azure-tools");
        return j({
          ok: true,
          action,
          added: AZURE_TOOL_NAMES,
          kept_count: kept.length,
          new_total: newTools.length,
          ...result,
        });
      }
      case "make-sp-safe": {
        const agent = agentNameFrom(body);
        return j({ ok: true, action, ...(await makeAgentSpSafe(agent)) });
      }
      case "make-war-room-sp-safe": {
        const results: any[] = [];
        for (const agent of WAR_ROOM_AGENTS) {
          try {
            results.push({ ...(await makeAgentSpSafe(agent)), ok: true });
          } catch (e) {
            results.push({ agent_name: agent, ok: false, error: (e as Error).message });
          }
        }
        return j({ ok: true, action, patched: results });
      }
      case "add-byom-connection": {
        // Register a Bring-Your-Own-Model connection in the Foundry project
        // pointing at a self-hosted OpenAI-compatible endpoint (LiteLLM on the
        // Mint VM, exposed via cloudflared). Non-destructive: PUT is idempotent
        // per connection name, and we take a connections backup first.
        const cbase = armProjectConnectionsBase();
        if (!cbase) return j({ ok: false, error: "ARM env vars missing", needed: ["AZURE_SUBSCRIPTION_ID","AZURE_RESOURCE_GROUP","AZURE_AI_ACCOUNT_NAME","AZURE_AI_PROJECT_NAME"] }, 400);

        const name    = String(body.name ?? "hf-brain-litellm").trim();
        const baseUrl = String(body.baseUrl  ?? Deno.env.get("LITELLM_BASE_URL") ?? "").trim();
        const apiKey  = String(body.apiKey   ?? Deno.env.get("LITELLM_API_KEY")  ?? "").trim();
        const modelId = String(body.modelName ?? Deno.env.get("HF_MODEL_NAME")   ?? "my-hf-brain").trim();
        if (!baseUrl) return j({ ok: false, error: "baseUrl required (or set LITELLM_BASE_URL secret)" }, 400);
        if (!apiKey)  return j({ ok: false, error: "apiKey required (or set LITELLM_API_KEY secret)" }, 400);

        const cx = await arm("GET", cbase);
        await sb.from("foundry_connection_backups").insert({
          label: "pre-add-byom:" + name, scope: "connections", agent_name: null, payload: cx.data,
        });

        // Foundry Serverless connection — OpenAI-compatible model gateway.
        const putBody = {
          properties: {
            category: "Serverless",
            authType: "ApiKey",
            target: baseUrl.replace(/\/$/, ""),
            isSharedToAll: true,
            credentials: { key: apiKey },
            metadata: {
              ApiType: "Azure",
              Kind: "OpenAI",
              ModelName: modelId,
              ModelProvider: "HuggingFace-via-LiteLLM",
              source: "byom-litellm",
            },
          },
        };
        const put = await arm("PUT", cbase + "/" + encodeURIComponent(name), putBody);
        await sb.from("foundry_connection_backups").insert({
          label: "post-add-byom:" + name, scope: "connection-put", agent_name: null,
          payload: {
            request: { ...putBody, properties: { ...putBody.properties, credentials: { key: "***redacted***" } } },
            response: put.data, status: put.status,
          },
        });

        return j({
          ok: put.ok, action, connection_name: name, status: put.status,
          target: putBody.properties.target, model_name: modelId, response: put.data,
        }, put.ok ? 200 : 502);
      }
      default:
        return j({ ok: false, error: "unknown action", allowed: ["backup","list-connections","list-agent-tools","probe-current","probe-after","patch-builder","install-azure-tools","make-sp-safe","make-war-room-sp-safe","add-byom-connection"] }, 400);
    }
  } catch (e) {
    return j({ ok: false, error: (e as Error).message }, 500);
  }
});
