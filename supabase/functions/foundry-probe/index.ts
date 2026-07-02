const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({grant_type:"client_credentials",client_id:CID,client_secret:SEC,scope:"https://ai.azure.com/.default"})});
  return (await r.json()).access_token as string;
}
Deno.serve(async (req) => {
  const t = await tok();
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "BUILDEROFAGENTS";
  const version = url.searchParams.get("version");
  const path = version ? `/agents/${name}/versions/${version}` : `/agents/${name}`;
  const r = await fetch(EP + path + "?api-version=v1", { headers: { Authorization: "Bearer " + t }});
  const txt = await r.text();
  return new Response(txt, { headers: { "content-type": "application/json" }});
});
