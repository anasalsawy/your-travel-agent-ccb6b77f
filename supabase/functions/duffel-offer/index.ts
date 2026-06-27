import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

function applyMarkup(amount: number): number {
  const pct = amount * 0.10;
  return Math.round((amount + Math.max(pct, 25)) * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { offer_id } = await req.json();
    if (!offer_id) {
      return new Response(JSON.stringify({ error: "offer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const r = await fetch("https://api.duffel.com/air/offers/" + offer_id + "?return_available_services=false", {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Duffel offer fetch failed", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await r.json();
    const o = j.data;
    return new Response(JSON.stringify({
      id: o.id,
      total_amount: o.total_amount,
      total_currency: o.total_currency,
      customer_amount: applyMarkup(parseFloat(o.total_amount)),
      expires_at: o.expires_at,
      passengers: o.passengers,
      slices: o.slices,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
