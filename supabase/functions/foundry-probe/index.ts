const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");

async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CID, client_secret: SEC, scope: "https://ai.azure.com/.default" }),
  });
  return (await r.json()).access_token as string;
}

Deno.serve(async () => {
  const results: any[] = [];
  const t = await tok();
  const hit = async (label: string, method: string, fullPath: string, body?: unknown) => {
    const url = EP + fullPath;
    try {
      const r = await fetch(url, {
        method,
        headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const txt = await r.text();
      results.push({ label, method, fullPath, status: r.status, body, resp: txt.slice(0, 500) });
      return { status: r.status, txt };
    } catch (e) { results.push({ label, error: (e as Error).message }); return { status: 0, txt: "" }; }
  };

  const N = "BUILDEROFAGENTS";

  // Responses API — Azure hint said "Use /v1 path instead"
  await hit("responses-v1", "POST", "/openai/v1/responses", { model: N, input: "ping" });
  await hit("responses-v1-agent", "POST", "/openai/v1/responses", { agent: { name: N }, input: "ping" });
  await hit("responses-v1-agent_id", "POST", "/openai/v1/responses", { agent_id: N, input: "ping" });
  await hit("responses-v1-extra_body", "POST", "/openai/v1/responses", { input: "ping", extra_body: { agent_id: N } });

  // Chat completions v1
  await hit("chat-v1", "POST", "/openai/v1/chat/completions", { model: N, messages: [{role:"user",content:"ping"}] });

  // Conversations flow
  const conv = await hit("create-conv", "POST", "/conversations?api-version=v1", {});
  let convId = ""; try { convId = JSON.parse(conv.txt).id; } catch {}
  if (convId) {
    await hit("conv-messages", "POST", "/conversations/"+convId+"/messages?api-version=v1", { role: "user", content: "ping" });
    await hit("conv-runs-assist", "POST", "/conversations/"+convId+"/runs?api-version=v1", { assistant_id: N });
    await hit("conv-runs-agent", "POST", "/conversations/"+convId+"/runs?api-version=v1", { agent_id: N });
    await hit("conv-responses", "POST", "/openai/v1/responses", { conversation: convId, agent_id: N, input: "ping" });
    await hit("conv-responses-model", "POST", "/openai/v1/responses", { conversation: convId, model: N, input: "ping" });
  }

  // Discover via OpenAPI
  await hit("v1-root", "GET", "/openai/v1");
  await hit("v1-models", "GET", "/openai/v1/models");
  await hit("agent-versions", "GET", "/agents/"+N+"/versions?api-version=v1");
  await hit("agent-tools", "GET", "/agents/"+N+"/tools?api-version=v1");

  // Try foundry runtime "prompts" endpoint
  await hit("run-agent-prompt", "POST", "/agents/"+N+"/run?api-version=v1", { input: "ping" });
  await hit("execute", "POST", "/agents/"+N+"/execute?api-version=v1", { input: "ping" });

  return new Response(JSON.stringify({ endpoint: EP, results }, null, 2), { headers: { "content-type": "application/json" } });
});
