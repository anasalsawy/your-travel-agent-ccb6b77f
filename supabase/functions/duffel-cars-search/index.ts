import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// POST: { pickup_location, dropoff_location?, pickup_datetime, dropoff_datetime, driver_age?, currency?, prepaid_only? }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();
    const {
      pickup_location,
      dropoff_location,
      pickup_datetime,
      dropoff_datetime,
      driver_age = 30,
      currency = "USD",
      prepaid_only = true,
    } = b;
    if (!pickup_location || !pickup_datetime || !dropoff_datetime) {
      return new Response(JSON.stringify({ error: "pickup_location, pickup_datetime, dropoff_datetime required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const r = await fetch(CARS_BASE + "/search_requests", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: {
          pickup_location,
          dropoff_location: dropoff_location || pickup_location,
          pickup_datetime,
          dropoff_datetime,
          driver_age,
          currency,
        },
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars search failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = (j?.data?.results || j?.data?.offers || []).map((o: any) => ({
      id: o.id,
      supplier: o.supplier?.name || o.vendor?.name,
      car_type: o.vehicle?.category || o.vehicle?.type,
      model: o.vehicle?.model,
      seats: o.vehicle?.seats,
      transmission: o.vehicle?.transmission,
      total_amount: o.total_amount,
      total_currency: o.total_currency || currency,
      payment_type: o.payment_type || o.payment?.type,
      cancellation: o.cancellation_policy || o.cancellation,
      pickup_location: o.pickup_location,
      dropoff_location: o.dropoff_location,
    }));

    const filtered = prepaid_only
      ? results.filter((x: any) => {
          const p = (x.payment_type || "").toString().toLowerCase();
          return p.includes("prepaid") || p.includes("online") || p === "" /* keep unknowns for visibility */;
        })
      : results;

    return new Response(JSON.stringify({ search_id: j?.data?.id, count: filtered.length, results: filtered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
