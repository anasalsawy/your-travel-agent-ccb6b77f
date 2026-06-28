import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// Body: { rate_id } (back-compat: offer_id)
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();
    const rate_id = b.rate_id || b.offer_id;
    if (!rate_id) {
      return new Response(JSON.stringify({ error: "rate_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/quotes", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ data: { rate_id } }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars quote failed", status: r.status, detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const q = j.data || j;
    return new Response(JSON.stringify({
      quote_id: q.id,
      car: q.car,
      supplier: q.supplier,
      total_amount: q.total_amount,
      total_currency: q.total_currency,
      base_amount: q.base_amount,
      base_currency: q.base_currency,
      payment_type: q.payment_type,
      conditions: q.conditions,
      charges: q.charges,
      pickup_location: q.pickup_location,
      dropoff_location: q.dropoff_location,
      expires_at: q.expires_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
