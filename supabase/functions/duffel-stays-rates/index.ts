import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// POST: { search_result_id } -> full rates for that property
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { search_result_id } = await req.json();
    if (!search_result_id) {
      return new Response(JSON.stringify({ error: "search_result_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(
      "https://api.duffel.com/stays/search_results/" + search_result_id + "/actions/fetch_all_rates",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + DUFFEL_TOKEN,
          "Duffel-Version": "v2",
          "Accept": "application/json",
        },
      },
    );
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel rates failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rates = (j?.data?.accommodation?.rooms || []).flatMap((room: any) =>
      (room.rates || []).map((rt: any) => ({
        rate_id: rt.id,
        room_name: room.name,
        board_type: rt.board_type,
        cancellation: rt.cancellation_timeline,
        total_amount: rt.total_amount,
        total_currency: rt.total_currency,
        payment_method: rt.payment_method,
        available_payment_methods: rt.available_payment_methods,
        supported_loyalty_programme: rt.supported_loyalty_programme,
      })),
    );

    return new Response(JSON.stringify({
      accommodation: {
        id: j?.data?.accommodation?.id,
        name: j?.data?.accommodation?.name,
        address: j?.data?.accommodation?.address,
      },
      rates,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
