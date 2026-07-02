// Azure AI Foundry v1-preview Agents API bridge.
// Supports: list, get, create, update, delete, summary, apply-roster on the NEW Agents surface.
// POST body: { action, ... }

import { ROSTER, buildInstructions } from "../_shared/agent-roster.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const AI_PROJECT = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
const API_VERSION = "v1";

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

async function az(method: string, path: string, body?: unknown): Promise<any> {
  if (!AI_PROJECT) throw new Error("AZURE_AI_PROJECT_ENDPOINT not set");
  const url = AI_PROJECT + path + (path.includes("?") ? "&" : "?") + "api-version=" + API_VERSION;
  const tok = await aiToken();
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + tok,
      "content-type": "application/json",
      "x-ms-enable-preview": "true",
      "Foundry-Features": "WorkflowAgents=V1Preview",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* raw */ }
  if (!r.ok) {
    return { __error: true, status: r.status, method, path, body: data };
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { action, name, agentName, definition, patch } = await req.json();

    let result: unknown;
    switch (action) {
      case "list":
        result = await az("GET", "/agents");
        break;
      case "summary": {
        const raw: any = await az("GET", "/agents");
        result = (raw?.data ?? []).map((a: any) => {
          const dfn = a?.versions?.latest?.definition ?? {};
          const tools = dfn?.tools ?? [];
          return {
            name: a.name,
            state: a.state,
            type: dfn.type ?? dfn.kind ?? "?",
            model: dfn.model,
            instructions: (dfn.instructions ?? "").slice(0, 120),
            tool_count: Array.isArray(tools) ? tools.length : 0,
            tool_types: Array.isArray(tools) ? tools.map((t: any) => t.type ?? t.kind).slice(0, 20) : [],
          };
        });
        break;
      }
      case "get":
        result = await az("GET", "/agents/" + encodeURIComponent(agentName ?? name));
        break;
      case "create":
        // definition = full PromptAgentDefinition
        result = await az("POST", "/agents", definition);
        break;
      case "update":
        // patch = partial PromptAgentDefinition merged server-side
        result = await az("PATCH", "/agents/" + encodeURIComponent(agentName ?? name), patch);
        break;
      case "delete":
        result = await az("DELETE", "/agents/" + encodeURIComponent(agentName ?? name));
        break;
      case "apply-roster": {
        // PATCH every agent in ROSTER with the full 6k-line core prompt + per-agent role tail,
        // and register the shared vapi_call / vapi_inject / vapi_hangup function tools.
        const targets = (req as any).__names ?? Object.keys(ROSTER);
        // Fetch shopper profile once so all shopper agents receive current standing orders.
        let profile: any = null;
        try {
          const pr = await fetch(
            "https://wpwdxtyufpewdyffxlgo.supabase.co/rest/v1/shopper_profile?id=eq.1&select=*",
            { headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", Authorization: "Bearer " + (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") } },
          );
          const rows = await pr.json();
          profile = Array.isArray(rows) ? rows[0] ?? null : null;
        } catch { /* ignore */ }
        // Foundry Agent Service requires FLAT function-tool shape:
        //   { type:"function", name, description, parameters }
        // AND tools only persist via POST /agents/{name}/versions with { definition: {...} }.
        // PATCH silently drops function tools. Do not switch back.
        const FN_TOOLS = [
          { type: "function", name: "vapi_call",
            description: "Dial an outbound phone number via Vapi to accomplish a mission. Returns a call_id.",
            parameters: { type:"object", properties:{ number:{type:"string",description:"E.164 phone"}, goal:{type:"string"}}, required:["number","goal"]}},
          { type: "function", name: "vapi_inject",
            description: "Steer an active Vapi call by injecting a system message the voice agent acts on immediately.",
            parameters: { type:"object", properties:{ call_id:{type:"string"}, message:{type:"string"}}, required:["call_id","message"]}},
          { type: "function", name: "vapi_hangup",
            description: "End an active Vapi call.",
            parameters: { type:"object", properties:{ call_id:{type:"string"}}, required:["call_id"]}},
          { type: "function", name: "war_room_post",
            description: "MANDATORY. Post a status update into the shared War Room so Chief of Staff, teammates, and CEO see it. Use instead of narrating in prose. Post at every state change (ACK/WORKING/BLOCKED/DONE/READY_FOR_PAYMENT/ASKING).",
            parameters: { type:"object", properties:{
              content:{type:"string", description:"1-3 sentence status starting with a status verb."},
              status:{type:"string", enum:["ack","working","blocked","done","ready_for_payment","asking","heartbeat"]},
              addressed_to:{type:"array", items:{type:"string"}},
            }, required:["content"]}},
          { type: "function", name: "war_room_heartbeat",
            description: "60-second liveness ping while working a long task. Chief nudges any agent silent >90s.",
            parameters: { type:"object", properties:{
              status_line:{type:"string"},
              mood:{type:"string", enum:["ready","working","blocked","waiting"]},
              current_task_id:{type:"string"},
            }}},
        ];
        const FN_NAMES = new Set(FN_TOOLS.map((t) => t.name));

        const results: any[] = [];
        for (const nm of targets) {
          try {
            const instructions = buildInstructions(nm, profile);
            const current: any = await az("GET", "/agents/" + encodeURIComponent(nm));
            const dfn = current?.versions?.latest?.definition ?? { kind: "chat", model: "gpt-4o-mini" };
            // Keep every existing tool that isn't one of ours (browser, mcp, file_search, etc.),
            // then append our fresh function tools.
            const preserved = (dfn.tools ?? []).filter((t: any) => !(t?.type === "function" && FN_NAMES.has(t?.name)));
            const merged = [...preserved, ...FN_TOOLS];
            const newDef = { ...dfn, instructions, tools: merged };
            const posted = await az("POST", "/agents/" + encodeURIComponent(nm) + "/versions", { definition: newDef });
            const ok = !posted?.__error && !posted?.error;
            results.push({ name: nm, ok, version: posted?.version ?? null, tools: merged.length, error: ok ? null : posted });
          } catch (e) {
            results.push({ name: nm, ok: false, error: (e as Error).message });
          }
        }
        result = results;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "unknown action: " + action }), {
          status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
        });
        return new Response(JSON.stringify({ error: "unknown action: " + action }), {
          status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ ok: true, result }, null, 2), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
