import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// Airport / city autocomplete via Duffel Places Suggestions API.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { query } = await req.json();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ places: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = "https://api.duffel.com/places/suggestions?query=" + encodeURIComponent(query);
    const r = await fetch(url, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Places lookup failed", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await r.json();
    const places = (j.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      iata_code: p.iata_code,
      iata_city_code: p.iata_city_code,
      iata_country_code: p.iata_country_code,
      type: p.type,
      city_name: p.city?.name,
    })).filter((p: any) => p.iata_code);
    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
