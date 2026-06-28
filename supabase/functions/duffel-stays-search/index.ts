import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// POST: { location: { radius_km, geographic_coordinates:{ latitude, longitude } } | { accommodation_ids:[] },
//         check_in_date, check_out_date, rooms, guests:[{type:"adult"}], currency? }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();
    const {
      latitude, longitude, radius_km = 5,
      accommodation_ids,
      check_in_date, check_out_date,
      rooms = 1,
      guests,
      adults = 2,
      currency = "USD",
    } = b;

    if (!check_in_date || !check_out_date) {
      return new Response(JSON.stringify({ error: "check_in_date and check_out_date required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const location = accommodation_ids?.length
      ? { accommodation: { ids: accommodation_ids } }
      : { radius: radius_km, geographic_coordinates: { latitude, longitude } };

    const guestList = guests || Array.from({ length: adults }, () => ({ type: "adult" }));

    const r = await fetch("https://api.duffel.com/stays/search", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: { location, check_in_date, check_out_date, rooms, guests: guestList, currency },
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel stays search failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = (j?.data?.results || []).map((x: any) => ({
      search_result_id: x.id,
      accommodation_id: x.accommodation?.id,
      name: x.accommodation?.name,
      rating: x.accommodation?.rating,
      review_score: x.accommodation?.review_score,
      address: x.accommodation?.address,
      photos: (x.accommodation?.photos || []).slice(0, 3).map((p: any) => p.url),
      cheapest_rate_total: x.cheapest_rate_total_amount,
      cheapest_rate_currency: x.cheapest_rate_currency,
    }));

    return new Response(JSON.stringify({ count: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
