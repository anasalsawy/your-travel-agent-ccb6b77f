// Azure AI Foundry v1-preview Agents API bridge.
// Supports: list, get, create, update, delete on the NEW Agents surface.
// POST body: { action: "list" | "get" | "update" | "create" | "delete", ...params }

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
      default:
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
