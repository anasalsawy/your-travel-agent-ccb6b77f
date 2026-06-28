import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// Body: { booking_id, user_approved: true }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { booking_id, user_approved } = await req.json();
    if (!user_approved) {
      return new Response(JSON.stringify({ error: "user_approved=true required for cancellation" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/bookings/" + booking_id + "/actions/cancel", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars cancel failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = j.data || j;
    return new Response(JSON.stringify({
      booking_id: d.id || booking_id,
      status: d.status || "cancelled",
      refund_amount: d.refund_amount,
      refund_currency: d.refund_currency,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
