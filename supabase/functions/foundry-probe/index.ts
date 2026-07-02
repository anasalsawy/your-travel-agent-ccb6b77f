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
  const hit = async (label: string, body: unknown) => {
    try {
      const r = await fetch(EP + "/openai/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      results.push({ label, status: r.status, body, resp: txt.slice(0, 600) });
    } catch (e) { results.push({ label, error: (e as Error).message }); }
  };
  const N = "BUILDEROFAGENTS";
  const M = "gpt-5.3-codex";
  const types = ["agent_reference","azure_ai_agent","foundry_agent","project_agent","agent","named_agent","prompt_agent","ai_foundry_agent","microsoft.agent","microsoft.foundry_agent"];
  for (const type of types) {
    await hit("agent.type="+type, { model: M, input: "ping", agent: { type, name: N } });
  }
  // Try id instead of name
  for (const type of ["agent_reference","azure_ai_agent","foundry_agent"]) {
    await hit("agent.id="+type, { model: M, input: "ping", agent: { type, id: N } });
  }
  // Try no model, with agent.type
  await hit("no-model agent_reference", { input: "ping", agent: { type: "agent_reference", name: N } });
  // Try tools style
  await hit("tools.azure_agent", { model: M, input: "ping", tools: [{ type: "azure_ai_agent", name: N }] });
  // Try Foundry doc suggestion 'prompt'
  await hit("prompt.reference", { model: M, input: "ping", prompt: { id: N } });
  await hit("prompt.name", { model: M, input: "ping", prompt: { name: N } });
  return new Response(JSON.stringify({ results }, null, 2), { headers: { "content-type": "application/json" } });
});
