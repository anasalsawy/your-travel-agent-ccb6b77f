const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");

async function tok(scope = "https://ai.azure.com/.default") {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CID, client_secret: SEC, scope }),
  });
  return (await r.json()).access_token as string;
}

Deno.serve(async (req) => {
  const results: any[] = [];
  const t = await tok();
  const url = new URL(req.url);
  const baseOverride = url.searchParams.get("base"); // let us swap host too
  const BASE = baseOverride ?? EP;
  const hit = async (method: string, path: string, body?: unknown, apiv = "v1", extraHeaders: Record<string,string> = {}) => {
    const u = BASE + path + (path.includes("?") ? "&" : "?") + "api-version=" + apiv;
    const r = await fetch(u, {
      method,
      headers: { Authorization: "Bearer " + t, "content-type": "application/json", "x-ms-enable-preview": "true", ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    results.push({ method, path, apiv, status: r.status, body: body ?? null, resp: txt.slice(0, 400) });
    return { status: r.status, txt };
  };

  const NAME = "BUILDEROFAGENTS";
  // Probe non-thread run paths
  await hit("POST", "/agents/" + NAME + ":invoke", { input: "ping" });
  await hit("POST", "/agents/" + NAME + "/invoke", { input: "ping" });
  await hit("POST", "/agents/" + NAME + "/chat", { messages: [{ role: "user", content: "ping" }] });
  await hit("POST", "/agents/" + NAME + "/complete", { input: "ping" });
  await hit("POST", "/agents/" + NAME + "/versions/57/runs", { input: "ping" });
  await hit("POST", "/agents/" + NAME + ":57/runs", { input: "ping" });

  // Responses API variants
  await hit("POST", "/openai/responses", { model: NAME, input: "ping" });
  await hit("POST", "/chat/completions", { model: NAME, messages: [{role:"user",content:"ping"}] });
  await hit("POST", "/openai/chat/completions", { model: NAME, messages: [{role:"user",content:"ping"}] });

  // Foundry data-plane "conversations"
  await hit("POST", "/conversations", { agent_id: NAME });
  await hit("POST", "/agents/" + NAME + "/conversations", {});

  // Root discovery
  await hit("GET", "/");
  await hit("GET", "/agents");
  await hit("GET", "/openapi");
  await hit("GET", "/swagger.json");
  await hit("GET", "/$metadata");

  // Try Foundry runtime host (subdomain swap): change services.ai.azure.com → agents.ai.azure.com
  const altHost = EP.replace("services.ai.azure.com", "agents.ai.azure.com");
  if (altHost !== EP) {
    try {
      const r = await fetch(altHost + "/agents/" + NAME + "?api-version=v1", { headers: { Authorization: "Bearer " + t }});
      results.push({ probe: "alt-host GET /agents/"+NAME, host: altHost, status: r.status, resp: (await r.text()).slice(0,300) });
    } catch (e) { results.push({ probe: "alt-host", error: (e as Error).message }); }
  }

  return new Response(JSON.stringify({ endpoint: BASE, results }, null, 2), { headers: { "content-type": "application/json" } });
});
