// vapi-call-inject: push a system message mid-call to steer the voice agent.
// Body: { call_id, message, source? }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { call_id, message, source } = await req.json();
    if (!call_id || !message) throw new Error("call_id and message required");
    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: call } = await db.from("vapi_calls").select("vapi_call_id").eq("id", call_id).single();
    if (!call?.vapi_call_id) throw new Error("call not found or not started");

    const r = await fetch("https://api.vapi.ai/call/" + call.vapi_call_id + "/control", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + VAPI_API_KEY },
      body: JSON.stringify({
        type: "add-message",
        message: { role: "system", content: message },
        triggerResponseEnabled: true,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Vapi inject failed: " + JSON.stringify(j));

    await db.from("vapi_call_events").insert({
      call_id, role: "steer", content: message, meta: { source: source ?? "operator" },
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
