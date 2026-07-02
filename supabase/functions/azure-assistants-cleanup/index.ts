// One-shot: delete Azure Foundry assistants that aren't tracked in azure_assistants.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const AI_PROJECT = Deno.env.get("AZURE_AI_PROJECT_ENDPOINT")!.replace(/\/$/, "");

async function getToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://ai.azure.com/.default",
  });
  const r = await fetch("https://login.microsoftonline.com/" + TENANT + "/oauth2/v2.0/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

async function az(method: string, path: string) {
  const token = await getToken();
  const url = AI_PROJECT + path + (path.includes("?") ? "&" : "?") + "api-version=v1";
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + token } });
  const t = await r.text();
  try { return { status: r.status, data: JSON.parse(t) }; } catch { return { status: r.status, data: t }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: keep } = await sb.from("azure_assistants").select("assistant_id, role, name");
    const keepIds = new Set((keep ?? []).map((r: any) => r.assistant_id));

    const list = await az("GET", "/assistants?limit=100");
    const items = list.data?.data ?? [];

    const deleted: string[] = [];
    const kept: string[] = [];
    for (const a of items) {
      if (keepIds.has(a.id)) { kept.push(a.id + " · " + a.name); continue; }
      const d = await az("DELETE", "/assistants/" + a.id);
      deleted.push(a.id + " · " + a.name + " → " + d.status);
    }

    return new Response(JSON.stringify({ ok: true, kept, deleted, total_before: items.length, db: keep }, null, 2), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
