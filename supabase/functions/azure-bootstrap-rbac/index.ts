// One-shot: grant our Service Principal the Azure AI User role on the Foundry account
// so azure-agent-run can create assistants/threads/runs.
// Public endpoint (verify_jwt=false), but the SP creds live server-side.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const SUB = Deno.env.get("AZURE_SUBSCRIPTION_ID")!;
const AI_PROJECT = Deno.env.get("AZURE_AI_PROJECT_ENDPOINT") ?? "";

async function tokenFor(scope: string): Promise<string> {
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("token " + scope + ": " + JSON.stringify(j));
  return j.access_token;
}

async function mgmt(method: string, url: string, body?: unknown): Promise<any> {
  const tok = await tokenFor("https://management.azure.com/.default");
  const r = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + tok, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let d: any = text; try { d = JSON.parse(text); } catch { /* raw */ }
  if (!r.ok) throw new Error("mgmt " + r.status + " " + method + " " + url + ": " + (typeof d === "string" ? d : JSON.stringify(d)));
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Extract account name from endpoint hostname: {account}.services.ai.azure.com
    const url = new URL(AI_PROJECT);
    const accountName = url.hostname.split(".")[0]; // e.g. anasalsawy-7430-resource

    // Find the Cognitive Services / AI Services account across subscription
    const list = await mgmt("GET",
      "https://management.azure.com/subscriptions/" + SUB +
      "/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01");
    const acct = (list.value ?? []).find((a: any) => a.name === accountName);
    if (!acct) throw new Error("Cognitive Services account not found: " + accountName);
    const scope = acct.id; // /subscriptions/.../resourceGroups/.../providers/Microsoft.CognitiveServices/accounts/{name}

    // Roles to assign: Azure AI User (broad) + Cognitive Services User (data plane fallback)
    // Azure AI User role definition id (built-in, tenant-wide):
    const roles = [
      { name: "Azure AI User", id: "53ca6127-db72-4b80-b1b0-d745d6d5456d" },
      { name: "Cognitive Services User", id: "a97b65f3-24c7-4388-baec-2e87135dc908" },
      { name: "Azure AI Developer", id: "64702f94-c441-49e6-a78b-ef80e0188fee" },
    ];

    // Resolve the SP's objectId via Graph
    const graphTok = await tokenFor("https://graph.microsoft.com/.default");
    const spRes = await fetch(
      "https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '" + CLIENT_ID + "'",
      { headers: { Authorization: "Bearer " + graphTok } }
    );
    const spJson = await spRes.json();
    const principalId = spJson.value?.[0]?.id;
    if (!principalId) throw new Error("SP objectId not found for appId " + CLIENT_ID);

    const results: any[] = [];
    for (const role of roles) {
      const assignmentId = crypto.randomUUID();
      const target = "https://management.azure.com" + scope +
        "/providers/Microsoft.Authorization/roleAssignments/" + assignmentId +
        "?api-version=2022-04-01";
      try {
        const r = await mgmt("PUT", target, {
          properties: {
            roleDefinitionId: "/subscriptions/" + SUB + "/providers/Microsoft.Authorization/roleDefinitions/" + role.id,
            principalId,
            principalType: "ServicePrincipal",
          },
        });
        results.push({ role: role.name, ok: true, id: r.id });
      } catch (e) {
        const msg = (e as Error).message;
        results.push({ role: role.name, ok: msg.includes("RoleAssignmentExists"), note: msg });
      }
    }

    return new Response(JSON.stringify({
      ok: true, accountName, scope, principalId, results,
      note: "RBAC can take 30-120s to propagate before azure-agent-run succeeds.",
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
