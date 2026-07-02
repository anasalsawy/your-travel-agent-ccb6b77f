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

async function backupAll(label: string) {
  const rows: any[] = [];
  // 1. Agent definition (full, with all versions if returned)
  const ag = await az("GET", "/agents/" + BUILDER);
  const b1 = await sb.from("foundry_connection_backups").insert({
    label, scope: "agent", agent_name: BUILDER, payload: ag.data,
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

async function probeCurrent(phase: "before" | "after") {
  const agent = await az("GET", "/agents/" + BUILDER);
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
      agent_reference: { type: "agent_reference", name: BUILDER },
      conversation: convId,
      input: [{ role: "user", content: prompt }],
    });
    const errText = resp.ok ? null : (typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data));
    const isToolUserErr = !!errText && /tool_user_error|signed-in user/i.test(errText);
    const ok = resp.ok && !isToolUserErr;
    const row = {
      phase, agent_name: BUILDER,
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

async function patchBuilder(newTools: any[], reason: string) {
  const before = await az("GET", "/agents/" + BUILDER);
  const back = await sb.from("foundry_connection_backups").insert({
    label: "pre-patch:" + reason, scope: "agent", agent_name: BUILDER, payload: before.data,
  }).select("id").single();

  const dfn = before.data?.versions?.latest?.definition ?? {};
  const newDef = { ...dfn, tools: newTools };
  const posted = await az("POST", "/agents/" + BUILDER + "/versions", { definition: newDef });
  return {
    backup_id: back.data?.id,
    posted_status: posted.status,
    posted_version: posted.data?.version ?? null,
    posted_error: posted.ok ? null : posted.data,
  };
}

// ---- Router ----

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
        return j({ ok: true, action, rows: await backupAll(label) });
      }
      case "list-connections": {
        const cbase = armProjectConnectionsBase();
        if (!cbase) return j({ ok: false, error: "ARM env vars missing", needed: ["AZURE_SUBSCRIPTION_ID","AZURE_RESOURCE_GROUP","AZURE_AI_ACCOUNT_NAME","AZURE_AI_PROJECT_NAME"] }, 400);
        const cx = await arm("GET", cbase);
        return j({ ok: cx.ok, status: cx.status, connections: cx.data });
      }
      case "list-agent-tools": {
        const ag = await az("GET", "/agents/" + BUILDER);
        return j({ ok: ag.ok, tools: summarizeBuilderTools(ag.data) });
      }
      case "probe-current": {
        // Auto-backup first.
        await backupAll("pre-probe-" + new Date().toISOString());
        return j({ ok: true, ...(await probeCurrent("before")) });
      }
      case "probe-after": {
        return j({ ok: true, ...(await probeCurrent("after")) });
      }
      case "patch-builder": {
        if (!Array.isArray(body.tools)) return j({ ok: false, error: "tools[] required" }, 400);
        return j({ ok: true, ...(await patchBuilder(body.tools, String(body.reason ?? "unspecified"))) });
      }
      default:
        return j({ ok: false, error: "unknown action", allowed: ["backup","list-connections","list-agent-tools","probe-current","probe-after","patch-builder"] }, 400);
    }
  } catch (e) {
    return j({ ok: false, error: (e as Error).message }, 500);
  }
});
