import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Trawex search scaffold.
 * Uses official API endpoint configured by env vars.
 * Expected env:
 * - TRAWEX_BASE_URL
 * - TRAWEX_API_KEY (optional depending on account)
 * - TRAWEX_USERNAME (optional)
 * - TRAWEX_PASSWORD (optional)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const base = (Deno.env.get("TRAWEX_BASE_URL") || "").trim();
    if (!base) throw new Error("TRAWEX_BASE_URL not set");

    const apiKey = (Deno.env.get("TRAWEX_API_KEY") || "").trim();
    const username = (Deno.env.get("TRAWEX_USERNAME") || "").trim();
    const password = (Deno.env.get("TRAWEX_PASSWORD") || "").trim();

    const endpoint = base.replace(/\/$/, "") + "/flights/search";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    if (apiKey) headers["x-api-key"] = apiKey;
    if (username && password) {
      headers["Authorization"] = "Basic " + btoa(`${username}:${password}`);
    }

    const trawexPayload = {
      origin: body.origin,
      destination: body.destination,
      departure_date: body.departure_date,
      return_date: body.return_date,
      adults: body.adults ?? 1,
      cabin_class: body.cabin_class ?? "economy",
      currency: body.currency ?? "USD",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(trawexPayload),
    });

    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: "Trawex search failed",
        provider: "trawex",
        status: res.status,
        detail: parsed,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      provider: "trawex",
      data: parsed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, provider: "trawex" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
