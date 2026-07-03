// Bridge-owned Azure function tools.
// Exposes capability-shaped tools to Foundry agents (BUILDEROFAGENTS et al.)
// backed by ARM REST + Foundry data-plane REST under the service principal.
// The agent calls capabilities ("azure_arm_get", "azure_foundry_list_agents");
// it never knows or cares about MCP vs REST vs SDK vs CLI.

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const AI_PROJECT = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
const ARM_SUB = Deno.env.get("AZURE_SUBSCRIPTION_ID") ?? "";
const ARM_RG = Deno.env.get("AZURE_RESOURCE_GROUP") ?? "";
const ARM_ACCOUNT = Deno.env.get("AZURE_AI_ACCOUNT_NAME") ?? "";
const ARM_PROJECT = Deno.env.get("AZURE_AI_PROJECT_NAME") ?? "";

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
const aiTok = () => tokFor("https://ai.azure.com/.default");
const armTok = () => tokFor("https://management.azure.com/.default");
const graphTok = () => tokFor("https://graph.microsoft.com/.default");

async function armCall(method: string, path: string, body?: unknown, apiVersion = "2025-06-01") {
  const url = "https://management.azure.com" + (path.startsWith("/") ? path : "/" + path)
    + (path.includes("?") ? "&" : "?") + "api-version=" + apiVersion;
  const t = await armTok();
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let d: any = txt; try { d = JSON.parse(txt); } catch { /* raw */ }
  return { status: r.status, ok: r.ok, data: d, url };
}

async function aiCall(method: string, path: string, body?: unknown) {
  if (!AI_PROJECT) throw new Error("AZURE_AI_PROJECT_ENDPOINT not set");
  const needsApiVer = !path.includes("/openai/v1/");
  const url = AI_PROJECT + (path.startsWith("/") ? path : "/" + path)
    + (needsApiVer ? (path.includes("?") ? "&" : "?") + "api-version=v1" : "");
  const t = await aiTok();
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let d: any = txt; try { d = JSON.parse(txt); } catch { /* raw */ }
  return { status: r.status, ok: r.ok, data: d, url };
}

async function graphCall(method: string, path: string, body?: unknown) {
  const url = "https://graph.microsoft.com/v1.0" + (path.startsWith("/") ? path : "/" + path);
  const t = await graphTok();
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let d: any = txt; try { d = JSON.parse(txt); } catch { /* raw */ }
  return { status: r.status, ok: r.ok, data: d, url };
}

function projectBase(): string {
  return "/subscriptions/" + ARM_SUB
    + "/resourceGroups/" + ARM_RG
    + "/providers/Microsoft.CognitiveServices/accounts/" + ARM_ACCOUNT
    + "/projects/" + ARM_PROJECT;
}

// ---------- Tool descriptors (Foundry function-tool shape) ----------
// Kept intentionally coarse: verbs, not vendor endpoints. The bridge maps them
// to REST today; tomorrow could swap to SDK/CLI without changing the agent.

export const AZURE_FUNCTION_TOOLS = [
  {
    type: "function",
    name: "azure_arm_get",
    description: "Read any Azure Resource Manager resource by path. Use for 'list resources', 'get resource', 'read properties'.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "ARM path, e.g. /subscriptions/{sub}/resourceGroups" },
        api_version: { type: "string", description: "Optional ARM api-version override." },
      },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "azure_arm_action",
    description: "Perform a write against Azure Resource Manager (PUT/POST/PATCH/DELETE). Use for create/update/delete/invoke on any Azure resource.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["PUT", "POST", "PATCH", "DELETE"] },
        path: { type: "string" },
        body: { type: "object", description: "JSON body for the ARM call. Omit for DELETE." },
        api_version: { type: "string" },
      },
      required: ["method", "path"],
    },
  },
  {
    type: "function",
    name: "azure_graph_query",
    description: "Call Microsoft Graph under the service principal. Use for directory, group, application, and service-principal reads/writes the SP is authorized for.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PATCH", "DELETE"] },
        path: { type: "string", description: "Graph path after /v1.0, e.g. /applications" },
        body: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
  {
    type: "function",
    name: "azure_foundry_list_agents",
    description: "List all Azure AI Foundry agents in the configured project.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "azure_foundry_get_agent",
    description: "Fetch a Foundry agent's full definition (all versions, tools, instructions).",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "azure_foundry_create_agent",
    description: "Create a new Azure AI Foundry agent from a definition object.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        definition: { type: "object", description: "Agent definition: model, instructions, tools[], etc." },
      },
      required: ["name", "definition"],
    },
  },
  {
    type: "function",
    name: "azure_foundry_publish_version",
    description: "Publish a new version of an existing Foundry agent by posting a full definition.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        definition: { type: "object" },
      },
      required: ["name", "definition"],
    },
  },
  {
    type: "function",
    name: "azure_foundry_list_connections",
    description: "List Foundry project connections (control plane).",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "azure_identity_whoami",
    description: "Return the service principal identity and effective ARM/AI/Graph token audiences the bridge is using.",
    parameters: { type: "object", properties: {} },
  },
] as const;

// ---------- Executor ----------

function truncate(data: unknown, max = 20_000): unknown {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  if (s.length <= max) return data;
  return { __truncated: true, preview: s.slice(0, max) };
}

export async function executeAzureTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case "azure_arm_get": {
      const r = await armCall("GET", args.path, undefined, args.api_version);
      return { status: r.status, ok: r.ok, url: r.url, data: truncate(r.data) };
    }
    case "azure_arm_action": {
      const r = await armCall(args.method, args.path, args.body, args.api_version);
      return { status: r.status, ok: r.ok, url: r.url, data: truncate(r.data) };
    }
    case "azure_graph_query": {
      const r = await graphCall(args.method, args.path, args.body);
      return { status: r.status, ok: r.ok, url: r.url, data: truncate(r.data) };
    }
    case "azure_foundry_list_agents": {
      const r = await aiCall("GET", "/agents");
      return { status: r.status, ok: r.ok, data: truncate(r.data) };
    }
    case "azure_foundry_get_agent": {
      const r = await aiCall("GET", "/agents/" + encodeURIComponent(args.name));
      return { status: r.status, ok: r.ok, data: truncate(r.data) };
    }
    case "azure_foundry_create_agent": {
      const r = await aiCall("POST", "/agents", { name: args.name, definition: args.definition });
      return { status: r.status, ok: r.ok, data: truncate(r.data) };
    }
    case "azure_foundry_publish_version": {
      const r = await aiCall("POST", "/agents/" + encodeURIComponent(args.name) + "/versions",
        { definition: args.definition });
      return { status: r.status, ok: r.ok, data: truncate(r.data) };
    }
    case "azure_foundry_list_connections": {
      if (!ARM_SUB || !ARM_RG || !ARM_ACCOUNT || !ARM_PROJECT) {
        return { ok: false, error: "ARM env vars missing" };
      }
      const r = await armCall("GET", projectBase() + "/connections");
      return { status: r.status, ok: r.ok, data: truncate(r.data) };
    }
    case "azure_identity_whoami": {
      return {
        ok: true,
        tenant_id: TENANT,
        client_id: CLIENT_ID,
        arm_scope: "https://management.azure.com/.default",
        ai_scope: "https://ai.azure.com/.default",
        graph_scope: "https://graph.microsoft.com/.default",
        subscription: ARM_SUB || null,
        resource_group: ARM_RG || null,
        ai_account: ARM_ACCOUNT || null,
        ai_project: ARM_PROJECT || null,
        ai_endpoint: AI_PROJECT || null,
      };
    }
    default:
      return { __unhandled: true, name };
  }
}

export const AZURE_TOOL_NAMES = AZURE_FUNCTION_TOOLS.map((t) => t.name);
