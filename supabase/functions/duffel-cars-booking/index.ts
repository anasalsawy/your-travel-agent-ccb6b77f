import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// GET ?booking_id=...  OR  POST { booking_id }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    let booking_id: string | null = null;
    if (req.method === "GET") {
      booking_id = new URL(req.url).searchParams.get("booking_id");
    } else {
      const b = await req.json().catch(() => ({}));
      booking_id = b.booking_id;
    }
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/bookings/" + booking_id, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars booking fetch failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = j.data || j;
    return new Response(JSON.stringify({
      booking_id: d.id,
      reference: d.reference || d.booking_reference,
      status: d.status,
      supplier: d.supplier?.name,
      car_type: d.vehicle?.category,
      model: d.vehicle?.model,
      total_amount: d.total_amount,
      total_currency: d.total_currency,
      payment_type: d.payment_type,
      pickup: d.pickup_location,
      dropoff: d.dropoff_location,
      pickup_datetime: d.pickup_datetime,
      dropoff_datetime: d.dropoff_datetime,
      driver: d.driver,
      cancellation: d.cancellation_policy,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
