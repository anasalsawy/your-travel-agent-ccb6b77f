// One-shot: delete Azure Foundry assistants that aren't tracked in azure_assistants.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: keep } = await sb.from("azure_assistants").select("assistant_id");
    const keepIds = new Set((keep ?? []).map((r: any) => r.assistant_id));

    // list via azure-rest
    const listR = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/azure-rest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ method: "GET", path: "/assistants?api-version=v1&limit=100", service: "ai" }),
    });
    const list = await listR.json();
    const items = list?.data?.data ?? list?.data ?? [];

    const deleted: string[] = [];
    const kept: string[] = [];
    for (const a of items) {
      if (keepIds.has(a.id)) { kept.push(a.id + " (" + a.name + ")"); continue; }
      const dr = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/azure-rest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({ method: "DELETE", path: "/assistants/" + a.id + "?api-version=v1", service: "ai" }),
      });
      deleted.push(a.id + " (" + a.name + ") -> " + dr.status);
    }

    return new Response(JSON.stringify({ ok: true, kept, deleted, total_before: items.length }, null, 2), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
