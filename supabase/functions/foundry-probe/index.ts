const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({grant_type:"client_credentials",client_id:CID,client_secret:SEC,scope:"https://ai.azure.com/.default"})});
  return (await r.json()).access_token as string;
}
async function az(method: string, path: string, body?: unknown) {
  const t = await tok();
  const r = await fetch(EP + path + "?api-version=v1", {
    method,
    headers: { Authorization: "Bearer " + t, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text(); let d: any = txt; try { d = JSON.parse(txt); } catch {}
  return { status: r.status, data: d };
}
Deno.serve(async () => {
  const name = "YTA-ASSISTANT";
  const cur = await az("GET", "/agents/" + name);
  const dfn = cur.data?.versions?.latest?.definition ?? {};
  const existing = Array.isArray(dfn.tools) ? dfn.tools : [];
  const warTools = [
    // Try nested `function` shape (Assistants-style)
    { type: "function", function: { name: "war_room_post", description: "Post to war room.", parameters: { type: "object", properties: { content:{type:"string"}}, required:["content"]}, strict: false }},
    { type: "function", function: { name: "war_room_heartbeat", description: "Liveness ping.", parameters: { type: "object", properties: { status_line:{type:"string"}}}, strict: false }},
  ];
  const nonFn = existing.filter((t:any) => t?.type !== "function");
  const merged = [...nonFn, ...warTools];
  const results: any[] = [];
  const pA = await az("PATCH", "/agents/" + name, { definition: { ...dfn, tools: merged }});
  results.push({ shape: "function-nested", status: pA.status, err: pA.status >= 300 ? pA.data : null });
  const g1 = await az("GET", "/agents/" + name);
  const nowTools = g1.data?.versions?.latest?.definition?.tools ?? [];
  results.push({ verify_tools: nowTools });
  return new Response(JSON.stringify(results, null, 2), { headers: {"content-type":"application/json"}});
});
