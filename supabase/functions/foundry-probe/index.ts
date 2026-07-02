// One-shot probe of Azure Foundry run endpoints
const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");

async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CID, client_secret: SEC, scope: "https://ai.azure.com/.default" }),
  });
  return (await r.json()).access_token as string;
}

Deno.serve(async () => {
  const results: any[] = [];
  const t = await tok();
  const hit = async (method: string, path: string, body?: unknown, apiv = "v1") => {
    const url = EP + path + (path.includes("?") ? "&" : "?") + "api-version=" + apiv;
    const r = await fetch(url, { method, headers: { Authorization: "Bearer " + t, "content-type": "application/json", "x-ms-enable-preview": "true" }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    results.push({ method, path, apiv, status: r.status, body: body ?? null, resp: txt.slice(0, 500) });
    return { status: r.status, txt };
  };

  const th = await hit("POST", "/threads", {});
  let threadId = "";
  try { threadId = JSON.parse(th.txt).id; } catch {}

  if (threadId) {
    await hit("POST", "/threads/" + threadId + "/messages", { role: "user", content: "ping" });
    await hit("POST", "/threads/" + threadId + "/runs", { agent_id: "BUILDEROFAGENTS" });
    await hit("POST", "/threads/" + threadId + "/runs", { assistantId: "BUILDEROFAGENTS" });
    await hit("POST", "/threads/" + threadId + "/runs", { agent: "BUILDEROFAGENTS" });
    await hit("POST", "/threads/" + threadId + "/runs", { name: "BUILDEROFAGENTS" });
    await hit("POST", "/threads/" + threadId + "/runs", { assistant_id: "BUILDEROFAGENTS" }, "2025-05-01");
    await hit("POST", "/threads/" + threadId + "/runs", { agent_id: "BUILDEROFAGENTS" }, "2025-05-01");
    await hit("POST", "/threads/" + threadId + "/runs", { assistant_id: "BUILDEROFAGENTS" }, "2024-12-01-preview");
  }
  await hit("POST", "/agents/BUILDEROFAGENTS/threads/" + threadId + "/runs", {});
  await hit("POST", "/agents/BUILDEROFAGENTS/runs", { thread_id: threadId });
  await hit("POST", "/responses", { model: "BUILDEROFAGENTS", input: "ping" });
  await hit("POST", "/agents/BUILDEROFAGENTS/responses", { input: "ping" });
  await hit("GET", "/agents/BUILDEROFAGENTS");
  await hit("GET", "/agents/BUILDEROFAGENTS/versions/latest");

  return new Response(JSON.stringify({ endpoint: EP, threadId, results }, null, 2), { headers: { "content-type": "application/json" } });
});
