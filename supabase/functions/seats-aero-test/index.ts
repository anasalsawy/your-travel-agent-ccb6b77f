import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SEATS_AERO_API_KEY');
    if (!apiKey) {
      throw new Error('SEATS_AERO_API_KEY is not configured');
    }

    // Test search: JFK to LHR in the next 30 days, business class
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const searchParams = new URLSearchParams({
      origin_airport: 'JFK',
      destination_airport: 'LHR',
      start_date: startDate,
      end_date: endDate,
      cabin: 'business',
      take: '10',
    });

    console.log(`Testing Seats.aero API with search: ${searchParams.toString()}`);

    const response = await fetch(`https://seats.aero/partnerapi/search?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Partner-Authorization': apiKey,
        'Accept': 'application/json',
      },
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Rate limit remaining: ${response.headers.get('X-RateLimit-Remaining')}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${errorText}`);
      return new Response(JSON.stringify({ 
        error: `API returned ${response.status}`, 
        details: errorText,
        rateLimitRemaining: response.headers.get('X-RateLimit-Remaining')
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log(`Results found: ${data?.data?.length || 0}`);

    return new Response(JSON.stringify({
      success: true,
      searchParams: {
        origin: 'JFK',
        destination: 'LHR',
        startDate,
        endDate,
        cabin: 'business',
      },
      rateLimitRemaining: response.headers.get('X-RateLimit-Remaining'),
      resultsCount: data?.data?.length || 0,
      data: data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in seats-aero-test function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
