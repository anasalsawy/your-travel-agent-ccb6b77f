import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { offer_id } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/offers/" + offer_id, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars quote failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const o = j.data || j;
    return new Response(JSON.stringify({
      id: o.id,
      supplier: o.supplier?.name,
      car_type: o.vehicle?.category,
      model: o.vehicle?.model,
      total_amount: o.total_amount,
      total_currency: o.total_currency,
      payment_type: o.payment_type,
      cancellation: o.cancellation_policy,
      pickup_location: o.pickup_location,
      dropoff_location: o.dropoff_location,
      includes: o.included || o.includes,
      expires_at: o.expires_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
