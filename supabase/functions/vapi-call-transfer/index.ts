// vapi-call-transfer: warm handoff — transfer the live call to a human (e.g. the traveler
// at the secure-payment stage, so no card data ever flows through the AI).
// Body: { call_id, destination (E.164), message? }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { call_id, destination, message } = await req.json();
    if (!call_id || !destination) throw new Error("call_id and destination required");
    if (!/^\+\d{7,15}$/.test(String(destination))) throw new Error("destination must be E.164, e.g. +17134698336");

    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: call } = await db.from("vapi_calls").select("vapi_call_id").eq("id", call_id).single();
    if (!call?.vapi_call_id) throw new Error("call not found or not started");

    const handoff = message ??
      "I'm now connecting the traveler directly to complete the secure payment. Please hold briefly.";

    const r = await fetch("https://api.vapi.ai/call/" + call.vapi_call_id + "/control", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + VAPI_API_KEY },
      body: JSON.stringify({
        type: "transfer",
        destination: { type: "number", number: String(destination), message: handoff },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Vapi transfer failed: " + JSON.stringify(j));

    await db.from("vapi_call_events").insert({
      call_id, role: "system", content: "SECURE_PAYMENT handoff → transferring to " + destination,
      meta: { event: "transfer", destination },
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
