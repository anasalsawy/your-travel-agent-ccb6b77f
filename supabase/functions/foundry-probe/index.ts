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
  const hit = async (label: string, path: string, body: unknown) => {
    try {
      const r = await fetch(EP + path, { method: "POST", headers: { Authorization: "Bearer " + t, "content-type": "application/json" }, body: JSON.stringify(body) });
      const txt = await r.text();
      results.push({ label, path, status: r.status, body, resp: txt.slice(0, 800) });
    } catch (e) { results.push({ label, error: (e as Error).message }); }
  };
  const N = "BUILDEROFAGENTS";
  await hit("agent_reference basic", "/openai/v1/responses", { input: "say hello", agent_reference: { type: "agent_reference", name: N } });
  await hit("agent_reference version", "/openai/v1/responses", { input: "say hello", agent_reference: { type: "agent_reference", name: N, version: "latest" } });
  await hit("agent_reference + conv", "/openai/v1/responses", { input: "say hello", agent_reference: { type: "agent_reference", name: N }, store: true });
  return new Response(JSON.stringify({ results }, null, 2), { headers: { "content-type": "application/json" } });
});
