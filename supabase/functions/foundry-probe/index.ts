const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CID = Deno.env.get("AZURE_CLIENT_ID")!;
const SEC = Deno.env.get("AZURE_CLIENT_SECRET")!;
const EP = (Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "").replace(/\/$/, "");
async function tok() {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({grant_type:"client_credentials",client_id:CID,client_secret:SEC,scope:"https://ai.azure.com/.default"})});
  return (await r.json()).access_token as string;
}
async function post(path: string, body: any) {
  const t = await tok();
  const r = await fetch(EP + path, { method:"POST", headers:{Authorization:"Bearer "+t,"content-type":"application/json"}, body: JSON.stringify(body)});
  const txt = await r.text(); let d:any=txt; try { d=JSON.parse(txt); } catch {}
  return { status: r.status, data: d };
}
Deno.serve(async () => {
  const tools = [
    { type: "function", name: "war_room_post", description: "Post a status update to the shared War Room so teammates and CEO see it.", parameters: { type:"object", properties: { content:{type:"string"}}, required:["content"], additionalProperties:false }, strict: false },
  ];
  // Fresh conversation
  const c = await post("/openai/v1/conversations", {});
  const results: any[] = [{ conv: c.status, id: c.data?.id }];
  const conv = c.data?.id;
  // Approach A: tools inline on Responses call, addressing YTA-ASSISTANT
  const r1 = await post("/openai/v1/responses", {
    agent_reference: { type: "agent_reference", name: "YTA-ASSISTANT" },
    conversation: conv,
    tools,
    tool_choice: "auto",
    input: [{ role:"user", content: "Call the war_room_post function with content='inline-tool test from bridge' and then reply with the single word DONE." }],
  });
  results.push({ inline_tools_A: r1.status, output: r1.data?.output ?? r1.data });
  return new Response(JSON.stringify(results, null, 2), { headers:{"content-type":"application/json"}});
});
