import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SMART QUOTE ENGINE
 * 
 * This function handles automated quote generation for Maya:
 * 1. Searches JustFly/market for lowest price
 * 2. Checks gift card inventory (for tickets under ~$1000)
 * 3. Checks points availability (for Alaska/American)
 * 4. Applies pricing rules (50% off, or 30% if already low)
 * 5. Returns quote or declines if not feasible
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteRequest {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  passengers: number;
  customer_phone?: string;
  customer_email?: string;
  customer_name?: string;
  conversation_id?: string;
}

interface QuoteResult {
  success: boolean;
  quoted_price?: number;
  market_price?: number;
  discount_percent?: number;
  payment_method?: 'gift_card' | 'points' | 'hybrid' | 'declined';
  message: string;
  reasoning?: string;
  quote_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body: QuoteRequest = await req.json();
    console.log("[SmartQuote] Request:", body);

    const { origin, destination, departure_date, return_date, passengers = 1 } = body;

    if (!origin || !destination || !departure_date) {
      return new Response(JSON.stringify({
        success: false,
        message: "Missing required fields: origin, destination, departure_date"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    // Step 1: Search market price via Perplexity (JustFly, Google Flights, etc.)
    let marketPrice: number | null = null;
    let marketSource = "";

    if (PERPLEXITY_API_KEY) {
      try {
        const tripType = return_date ? "round-trip" : "one-way";
        const searchQuery = `What is the lowest price for a ${tripType} flight from ${origin} to ${destination} departing ${departure_date}${return_date ? ` returning ${return_date}` : ''} for ${passengers} passenger(s)? Check JustFly, Google Flights, and Kayak. Give me just the lowest price number.`;

        const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a flight price researcher. Return only the lowest price as a number, no other text." },
              { role: "user", content: searchQuery }
            ],
            max_tokens: 100
          })
        });

        if (perplexityRes.ok) {
          const perplexityData = await perplexityRes.json();
          const priceText = perplexityData.choices?.[0]?.message?.content || "";
          // Extract number from response
          const priceMatch = priceText.match(/\$?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/);
          if (priceMatch) {
            marketPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            marketSource = "Perplexity/JustFly";
            console.log("[SmartQuote] Market price found:", marketPrice);
          }
        }
      } catch (e) {
        console.error("[SmartQuote] Perplexity search error:", e);
      }
    }

    // If no market price, use a rough estimate based on route
    if (!marketPrice) {
      // Rough domestic/international estimate
      const isDomestic = origin.length === 3 && destination.length === 3;
      marketPrice = isDomestic 
        ? (return_date ? 400 : 200) * passengers
        : (return_date ? 1200 : 600) * passengers;
      marketSource = "estimate";
    }

    // Step 2: Get pricing rules
    const { data: pricingRules } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    // Find applicable rule
    let discountPercent = 50; // Default 50%
    if (pricingRules) {
      for (const rule of pricingRules) {
        const minOk = !rule.min_market_price || marketPrice >= rule.min_market_price;
        const maxOk = !rule.max_market_price || marketPrice <= rule.max_market_price;
        if (minOk && maxOk) {
          discountPercent = rule.discount_percent;
          console.log("[SmartQuote] Using rule:", rule.rule_name, "discount:", discountPercent);
          break;
        }
      }
    }

    // Step 3: Check inventory availability
    let paymentMethod: 'gift_card' | 'points' | 'hybrid' | 'declined' = 'declined';
    let canFulfill = false;
    let reasoning = "";

    const quotedPrice = Math.round((marketPrice * (1 - discountPercent / 100)) / 10) * 10; // Round to nearest $10

    // Check gift cards first (for tickets up to ~$1000)
    if (marketPrice <= 1000) {
      const { data: availableCards } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('status', 'available')
        .gte('balance', marketPrice * 0.5); // Need at least half price in card

      if (availableCards && availableCards.length > 0) {
        paymentMethod = 'gift_card';
        canFulfill = true;
        reasoning = `Gift card available with sufficient balance`;
        console.log("[SmartQuote] Can fulfill with gift card");
      }
    }

    // Check points (primarily for Alaska and American)
    if (!canFulfill) {
      // Rough points calculation: ~15,000 points = $150 value, so ~100 points = $1
      const estimatedPointsNeeded = Math.round(marketPrice * 100); // Very rough estimate
      
      const { data: availablePoints } = await supabase
        .from('points_accounts')
        .select('*')
        .eq('status', 'active')
        .in('airline', ['Alaska', 'American'])
        .gte('points_balance', estimatedPointsNeeded * 0.6); // Some buffer

      if (availablePoints && availablePoints.length > 0) {
        paymentMethod = 'points';
        canFulfill = true;
        reasoning = `Points account available (${availablePoints[0].airline})`;
        console.log("[SmartQuote] Can fulfill with points:", availablePoints[0].airline);
      }
    }

    // If still can't fulfill, check if we have any cards at all for higher prices
    if (!canFulfill && marketPrice > 1000) {
      const { data: anyCards } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('status', 'available');

      const totalCardBalance = anyCards?.reduce((sum, c) => sum + c.balance, 0) || 0;
      
      if (totalCardBalance >= marketPrice * 0.4) {
        // Can potentially combine cards
        paymentMethod = 'hybrid';
        canFulfill = true;
        reasoning = `Can combine multiple payment sources`;
      }
    }

    // Step 4: Generate result
    let result: QuoteResult;

    if (canFulfill) {
      // Log the quote
      const { data: quoteLog, error: logError } = await supabase
        .from('quote_logs')
        .insert({
          customer_phone: body.customer_phone,
          customer_email: body.customer_email,
          customer_name: body.customer_name,
          route: `${origin} to ${destination}`,
          travel_dates: return_date ? `${departure_date} - ${return_date}` : departure_date,
          passengers,
          market_price: marketPrice,
          quoted_price: quotedPrice,
          discount_applied: discountPercent,
          payment_method: paymentMethod,
          status: 'quoted',
          conversation_id: body.conversation_id,
          auto_approved: true
        })
        .select()
        .single();

      if (logError) {
        console.error("[SmartQuote] Error logging quote:", logError);
      }

      result = {
        success: true,
        quoted_price: quotedPrice,
        market_price: marketPrice,
        discount_percent: discountPercent,
        payment_method: paymentMethod,
        message: `Great news! I can get you this flight for $${quotedPrice} - that's ${discountPercent}% off the market price of $${marketPrice}.`,
        reasoning,
        quote_id: quoteLog?.id
      };
    } else {
      // Can't fulfill - decline
      const { error: logError } = await supabase
        .from('quote_logs')
        .insert({
          customer_phone: body.customer_phone,
          customer_email: body.customer_email,
          customer_name: body.customer_name,
          route: `${origin} to ${destination}`,
          travel_dates: return_date ? `${departure_date} - ${return_date}` : departure_date,
          passengers,
          market_price: marketPrice,
          quoted_price: 0,
          payment_method: 'declined',
          status: 'declined',
          conversation_id: body.conversation_id,
          auto_approved: false,
          admin_notes: 'No inventory available for this route/price range'
        });

      result = {
        success: false,
        market_price: marketPrice,
        payment_method: 'declined',
        message: `I apologize, but I'm unable to offer a discount on this particular route at this time. The current market price is around $${marketPrice}. Would you like me to submit a ticket request and have our team look for alternative options?`,
        reasoning: 'No gift cards or points available for this price range'
      };
    }

    console.log("[SmartQuote] Result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("[SmartQuote] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      success: false,
      message: "Error generating quote. Please try again.",
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
