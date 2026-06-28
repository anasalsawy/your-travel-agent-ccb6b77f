import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// Body: { offer_id, driver: { given_name, family_name, email, phone_number, born_on }, user_approved: true }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();
    const { offer_id, driver, user_approved } = b;
    if (!user_approved) {
      return new Response(JSON.stringify({ error: "user_approved=true required for booking" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!offer_id || !driver?.given_name || !driver?.family_name || !driver?.email) {
      return new Response(JSON.stringify({ error: "offer_id and driver (given_name, family_name, email) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/bookings", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: {
          selected_offer: offer_id,
          driver,
          payment: { type: "balance" },
        },
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars booking failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = j.data || j;
    return new Response(JSON.stringify({
      booking_id: d.id,
      reference: d.reference || d.booking_reference,
      status: d.status,
      supplier: d.supplier?.name,
      total_amount: d.total_amount,
      total_currency: d.total_currency,
      pickup: d.pickup_location,
      dropoff: d.dropoff_location,
      cancellation: d.cancellation_policy,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
