import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pickMonitorUrl(payload: any): string | null {
  const candidates = [
    payload?.monitor?.listenUrl,
    payload?.monitor?.url,
    payload?.live?.url,
    payload?.stream?.url,
    payload?.transport?.streamUrl,
    payload?.webCallUrl,
    payload?.customer?.webCallUrl,
  ];
  const url = candidates.find((u) => typeof u === "string" && /^https?:\/\//i.test(u));
  return typeof url === "string" ? url : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { call_id } = await req.json();
    if (!call_id) throw new Error("call_id required");

    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row, error } = await db
      .from("vapi_calls")
      .select("id, vapi_call_id, status")
      .eq("id", call_id)
      .single();
    if (error || !row) throw new Error("call not found");
    if (!row.vapi_call_id) return json({ ok: true, status: row.status, monitor_url: null });

    const r = await fetch("https://api.vapi.ai/call/" + row.vapi_call_id, {
      method: "GET",
      headers: { Authorization: "Bearer " + VAPI_API_KEY },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Vapi status failed: " + JSON.stringify(j));

    const monitorUrl = pickMonitorUrl(j);
    return json({
      ok: true,
      status: j?.status ?? row.status,
      monitor_url: monitorUrl,
      vapi_call_id: row.vapi_call_id,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
