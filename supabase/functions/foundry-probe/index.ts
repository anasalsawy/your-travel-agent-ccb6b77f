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
    { type: "function", name: "war_room_post", description: "Post a status update to the shared War Room. Call this on ACK, WORKING, BLOCKED, DONE.", parameters: { type: "object", properties: { content: {type:"string"}, status: {type:"string", enum:["ack","working","blocked","done","asking","heartbeat"]}, addressed_to:{type:"array", items:{type:"string"}}}, required:["content"]}},
    { type: "function", name: "war_room_heartbeat", description: "60-second liveness ping.", parameters: { type: "object", properties: { status_line:{type:"string"}, mood:{type:"string"} }}},
  ];
  const have = new Set(existing.map((t:any)=> t?.name ?? t?.function?.name).filter(Boolean));
  const merged = [...existing, ...warTools.filter(t => !have.has(t.name))];
  const results: any[] = [];
  // Try PATCH shape A: definition wrapper
  const pA = await az("PATCH", "/agents/" + name, { definition: { ...dfn, tools: merged }});
  results.push({ shape: "definition-wrapper", status: pA.status, err: pA.status >= 300 ? pA.data : null });
  // Verify
  const g1 = await az("GET", "/agents/" + name);
  const nowNames = (g1.data?.versions?.latest?.definition?.tools ?? []).map((t:any)=> t?.name ?? t?.function?.name);
  results.push({ verify_A_tool_names: nowNames });
  return new Response(JSON.stringify(results, null, 2), { headers: {"content-type":"application/json"}});
});
