import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const amadeusApiKey = Deno.env.get("AMADEUS_API_KEY");
    const amadeusApiSecret = Deno.env.get("AMADEUS_API_SECRET");

    console.log("Testing Amadeus API...");
    console.log("API Key exists:", !!amadeusApiKey);
    console.log("API Secret exists:", !!amadeusApiSecret);

    if (!amadeusApiKey || !amadeusApiSecret) {
      return new Response(JSON.stringify({ 
        error: "Missing credentials",
        hasKey: !!amadeusApiKey,
        hasSecret: !!amadeusApiSecret
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    // Step 1: Get OAuth token
    console.log("Getting OAuth token...");
    const tokenResponse = await fetch("https://test.api.amadeus.com/v1/security/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: amadeusApiKey,
        client_secret: amadeusApiSecret
      })
    });

    const tokenText = await tokenResponse.text();
    console.log("Token response status:", tokenResponse.status);
    console.log("Token response:", tokenText);

    if (!tokenResponse.ok) {
      return new Response(JSON.stringify({ 
        error: "Token request failed",
        status: tokenResponse.status,
        response: tokenText
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const tokenData = JSON.parse(tokenText);
    const accessToken = tokenData.access_token;
    console.log("Got access token:", !!accessToken);

    // City to airport mapping
    const cityToAirport: Record<string, string> = {
      "new york": "JFK", "nyc": "JFK",
      "los angeles": "LAX", "la": "LAX",
      "chicago": "ORD",
      "miami": "MIA",
      "cyprus": "LCA", "larnaca": "LCA"
    };
    
    const toAirportCode = (input: string): string => {
      const normalized = input.toLowerCase().trim();
      if (/^[a-zA-Z]{3}$/.test(normalized)) return normalized.toUpperCase();
      return cityToAirport[normalized] || input.toUpperCase();
    };
    
    // Test with city names
    const origin = "New York";
    const destination = "Los Angeles";
    const originCode = toAirportCode(origin);
    const destCode = toAirportCode(destination);
    
    console.log(`Converting: "${origin}" -> "${originCode}", "${destination}" -> "${destCode}"`);
    
    const searchParams = new URLSearchParams({
      originLocationCode: originCode,
      destinationLocationCode: destCode,
      departureDate: "2026-03-15",
      adults: "1",
      max: "3",
      currencyCode: "USD"
    });

    console.log("Searching flights...");
    const flightResponse = await fetch(
      `https://test.api.amadeus.com/v2/shopping/flight-offers?${searchParams.toString()}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    const flightText = await flightResponse.text();
    console.log("Flight response status:", flightResponse.status);
    console.log("Flight response:", flightText.substring(0, 500));

    if (!flightResponse.ok) {
      return new Response(JSON.stringify({ 
        error: "Flight search failed",
        status: flightResponse.status,
        response: flightText
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const flightData = JSON.parse(flightText);
    const offers = flightData.data || [];

    return new Response(JSON.stringify({ 
      success: true,
      tokenOk: true,
      flightsFound: offers.length,
      sample: offers.slice(0, 2).map((o: any) => ({
        price: o.price?.total,
        airline: o.itineraries?.[0]?.segments?.[0]?.carrierCode
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error("Test error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
