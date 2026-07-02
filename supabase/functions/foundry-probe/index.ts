const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({grant_type:"client_credentials",client_id:CID,client_secret:SEC,scope:"https://ai.azure.com/.default"})});
  return (await r.json()).access_token as string;
}
async function req(method:string, path:string, body?:any) {
  const t = await tok();
  const r = await fetch(EP + path + (path.includes("?")?"&":"?") + "api-version=v1", { method, headers:{Authorization:"Bearer "+t,"content-type":"application/json"}, body: body?JSON.stringify(body):undefined});
  const txt = await r.text(); let d:any=txt; try { d=JSON.parse(txt); } catch {}
  return { status: r.status, data: d };
}
Deno.serve(async () => {
  const name = "YTA-ASSISTANT";
  const cur = await req("GET", "/agents/" + name);
  const dfn = cur.data?.versions?.latest?.definition ?? {};
  const existing = (dfn.tools ?? []).filter((t:any) => t?.type !== "function");
  const results:any[] = [];
  const shapes: any[] = [
    { label:"nested-function", tool: { type:"function", function:{ name:"war_room_post", description:"Post to war room.", parameters:{type:"object",properties:{content:{type:"string"}},required:["content"]}}}},
    { label:"flat-name", tool: { type:"function", name:"war_room_post", description:"Post to war room.", parameters:{type:"object",properties:{content:{type:"string"}},required:["content"]}}},
    { label:"flat-strict", tool: { type:"function", name:"war_room_post", description:"Post to war room.", parameters:{type:"object",properties:{content:{type:"string"}},required:["content"],additionalProperties:false}, strict:true}},
  ];
  for (const s of shapes) {
    const newDef = { ...dfn, tools: [...existing, s.tool] };
    const p = await req("POST", "/agents/" + name + "/versions", { definition: newDef });
    results.push({ shape: s.label, status: p.status, err: p.status>=300 ? p.data : null, latest_version: p.data?.version });
    if (p.status < 300) {
      const g = await req("GET", "/agents/" + name);
      const t = (g.data?.versions?.latest?.definition?.tools ?? []).filter((x:any)=> x?.type==="function");
      results.push({ persisted_function_tools: t });
      break;
    }
  }
  return new Response(JSON.stringify(results, null, 2), { headers:{"content-type":"application/json"}});
});
