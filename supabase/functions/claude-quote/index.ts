import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * CLAUDE QUOTE ENDPOINT
 * 
 * This is the endpoint Maya calls when she needs a quote.
 * Claude (the Manager) handles all quote logic here.
 * 
 * Flow:
 * 1. Maya asks for a quote → calls this endpoint
 * 2. Claude does comprehensive research:
 *    - Search Perplexity for market prices
 *    - Check Seats.aero for Alaska availability
 *    - Check our inventory (gift cards, points)
 *    - Apply pricing rules
 * 3. Returns quote Maya can present to customer
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuoteRequest {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  passengers?: number;
  cabin_class?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_name?: string;
  ticket_request_id?: string;
  conversation_id?: string;
}

interface QuoteResponse {
  success: boolean;
  quoted_price?: number;
  market_price?: number;
  discount_percent?: number;
  booking_method?: string;
  confidence?: 'high' | 'medium' | 'low';
  message: string;
  notes?: string;
  quote_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const SEATS_AERO_API_KEY = Deno.env.get('SEATS_AERO_API_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: QuoteRequest = await req.json();

    const {
      origin,
      destination,
      departure_date,
      return_date,
      passengers = 1,
      cabin_class = 'economy',
      customer_phone,
      customer_email,
      customer_name,
      ticket_request_id,
      conversation_id,
    } = body;

    // Validate required fields
    if (!origin || !destination || !departure_date) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields: origin, destination, departure_date',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Claude Quote] Generating quote for ${origin} → ${destination} on ${departure_date}`);

    let marketPrice: number | null = null;
    let alaskaAvailable = false;
    let searchNotes: string[] = [];

    // 1. Search Perplexity for market prices
    if (PERPLEXITY_API_KEY) {
      try {
        const tripType = return_date ? 'round-trip' : 'one-way';
        const searchQuery = `What is the current lowest price for a ${cabin_class} ${tripType} flight from ${origin} to ${destination} departing ${departure_date}${return_date ? ` returning ${return_date}` : ''}? Check Google Flights, Expedia, and Kayak. Give me a specific dollar amount.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{ role: 'user', content: searchQuery }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content || '';

          // Extract price - look for dollar amounts
          const priceMatches = answer.match(/\$[\d,]+/g);
          if (priceMatches?.length) {
            const prices = priceMatches
              .map((p: string) => parseInt(p.replace(/[$,]/g, '')))
              .filter((p: number) => p > 50 && p < 20000);

            if (prices.length) {
              // Use median price for better estimate
              prices.sort((a: number, b: number) => a - b);
              marketPrice = prices[Math.floor(prices.length / 2)];
              searchNotes.push(`Perplexity found prices: ${priceMatches.join(', ')}`);
            }
          }
        }
      } catch (error) {
        console.error('[Claude Quote] Perplexity error:', error);
        searchNotes.push('Perplexity search failed');
      }
    }

    // 2. Check Seats.aero for Alaska availability
    if (SEATS_AERO_API_KEY) {
      try {
        const response = await fetch(
          `https://seats.aero/api/availability?origin=${origin}&destination=${destination}&date=${departure_date}&source=alaska`,
          {
            headers: { 'Authorization': `Bearer ${SEATS_AERO_API_KEY}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          alaskaAvailable = data.availability?.length > 0;
          if (alaskaAvailable) {
            searchNotes.push('Alaska award availability confirmed');
          }
        }
      } catch (error) {
        console.error('[Claude Quote] Seats.aero error:', error);
      }
    }

    // 3. Check our inventory
    const { data: giftCards } = await supabase
      .from('gift_cards')
      .select('id, airline, balance')
      .eq('status', 'active')
      .gte('balance', 100)
      .order('balance', { ascending: false })
      .limit(5);

    const { data: pointsAccounts } = await supabase
      .from('points_accounts')
      .select('id, airline, points_balance')
      .eq('status', 'active')
      .in('airline', ['Alaska', 'American'])
      .gte('points_balance', 10000)
      .order('points_balance', { ascending: false })
      .limit(5);

    // 4. Get pricing rules
    const { data: pricingRules } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    // 5. Calculate quote
    // Default market price estimate if search failed
    if (!marketPrice) {
      // Rough estimate based on route distance and class
      const isInternational = origin.length === 3 && destination.length === 3 &&
        !['JFK', 'LAX', 'ORD', 'DFW', 'ATL', 'DEN', 'SFO', 'SEA', 'MIA', 'BOS'].some(
          hub => origin.includes(hub) || destination.includes(hub)
        );

      const basePrice = isInternational ? 1200 : 400;
      const classMultiplier = cabin_class === 'first' ? 4 : cabin_class === 'business' ? 2.5 : 1;
      const tripMultiplier = return_date ? 1.8 : 1;

      marketPrice = Math.round(basePrice * classMultiplier * tripMultiplier);
      searchNotes.push('Using estimated market price (search failed)');
    }

    // Apply pricing rules
    let discountPercent = 50; // Default 50% discount
    if (pricingRules?.length) {
      for (const rule of pricingRules) {
        const matchesMin = !rule.min_market_price || marketPrice >= rule.min_market_price;
        const matchesMax = !rule.max_market_price || marketPrice <= rule.max_market_price;

        if (matchesMin && matchesMax) {
          discountPercent = rule.discount_percent;
          searchNotes.push(`Applied pricing rule: ${rule.rule_name} (${discountPercent}% off)`);
          break;
        }
      }
    }

    // Calculate final quote
    const quotedPrice = Math.round(marketPrice * (1 - discountPercent / 100) * passengers);

    // Determine booking method
    let bookingMethod = 'gift_card';
    let inventoryId: string | null = null;
    let inventoryType: string | null = null;

    // Prefer Alaska points if available
    const alaskaPoints = pointsAccounts?.find(p => p.airline === 'Alaska');
    if (alaskaAvailable && alaskaPoints && alaskaPoints.points_balance >= 15000 * passengers) {
      bookingMethod = 'alaska_points';
      inventoryId = alaskaPoints.id;
      inventoryType = 'points';
    } else if (giftCards?.length && giftCards[0].balance >= quotedPrice) {
      bookingMethod = 'gift_card';
      inventoryId = giftCards[0].id;
      inventoryType = 'gift_card';
    } else if (giftCards?.length) {
      // Use multiple gift cards
      bookingMethod = 'gift_card_combo';
      inventoryType = 'gift_card';
    }

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (PERPLEXITY_API_KEY && marketPrice && !searchNotes.some(n => n.includes('failed'))) {
      confidence = 'high';
    } else if (!marketPrice) {
      confidence = 'low';
    }

    // 6. Log the quote
    const { data: quoteLog, error: logError } = await supabase
      .from('quote_logs')
      .insert({
        route: `${origin} → ${destination}`,
        travel_dates: `${departure_date}${return_date ? ` - ${return_date}` : ''}`,
        passengers,
        market_price: marketPrice,
        quoted_price: quotedPrice,
        discount_applied: discountPercent,
        booking_method: bookingMethod,
        inventory_type: inventoryType,
        inventory_id: inventoryId,
        alaska_available: alaskaAvailable,
        customer_phone,
        customer_email,
        customer_name,
        ticket_request_id,
        conversation_id,
        status: 'quoted',
        auto_approved: true,
        admin_notes: searchNotes.join('\n'),
      })
      .select()
      .single();

    if (logError) {
      console.error('[Claude Quote] Failed to log quote:', logError);
    }

    // 7. Build response
    const response: QuoteResponse = {
      success: true,
      quoted_price: quotedPrice,
      market_price: marketPrice,
      discount_percent: discountPercent,
      booking_method: bookingMethod,
      confidence,
      message: `I can get you ${origin} to ${destination} for $${quotedPrice}`,
      notes: alaskaAvailable
        ? 'Alaska award availability confirmed - great option!'
        : bookingMethod === 'gift_card'
        ? 'Booking with discounted gift cards'
        : 'Standard booking',
      quote_id: quoteLog?.id,
    };

    console.log(`[Claude Quote] Generated: $${quotedPrice} (${discountPercent}% off $${marketPrice})`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Claude Quote] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Quote generation failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
