import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SMART QUOTE ENGINE V2 - ALASKA-FIRST BOOKING LOGIC
 * 
 * Decision tree:
 * 1. Check if ticket is available on Alaska Airlines
 * 2. If YES on Alaska → decide between points OR cards (Alaska account preference)
 * 3. If NOT on Alaska → only cards if price ≤ $1000
 * 4. If above $1000 and not on Alaska → DECLINE
 * 
 * This engine powers Maya's automated quoting and determines the booking method.
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
  cabin_class?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_name?: string;
  conversation_id?: string;
  ticket_request_id?: string;
}

interface QuoteResult {
  success: boolean;
  quoted_price?: number;
  market_price?: number;
  discount_percent?: number;
  booking_method?: 'alaska_points' | 'alaska_card' | 'gift_card' | 'declined';
  alaska_available: boolean;
  inventory_type?: 'points' | 'gift_card' | 'none';
  inventory_id?: string;
  message: string;
  reasoning?: string;
  quote_id?: string;
  next_steps?: string;
}

// Check if route is likely served by Alaska Airlines
function isAlaskaRoute(origin: string, destination: string): boolean {
  const alaskaHubs = ['SEA', 'PDX', 'SFO', 'LAX', 'ANC', 'JNU', 'FAI'];
  const alaskaStrongRoutes = [
    'SEA', 'PDX', 'SFO', 'LAX', 'SAN', 'PHX', 'LAS', 'DEN',
    'ANC', 'JNU', 'FAI', 'KTN', 'SIT', // Alaska state
    'HNL', 'OGG', 'LIH', 'KOA', // Hawaii
    'MEX', 'GDL', 'SJD', 'PVR', // Mexico
    'YVR', 'YYJ', 'YYC', // Canada
  ];
  
  const orig = origin.toUpperCase();
  const dest = destination.toUpperCase();
  
  // Strong indicator: hub to hub or hub to Alaska-served city
  if (alaskaHubs.includes(orig) || alaskaHubs.includes(dest)) {
    return true;
  }
  
  // Both cities in Alaska's network
  if (alaskaStrongRoutes.includes(orig) && alaskaStrongRoutes.includes(dest)) {
    return true;
  }
  
  // West Coast to West Coast likely on Alaska
  const westCoast = ['SEA', 'PDX', 'SFO', 'OAK', 'SJC', 'LAX', 'SAN', 'SMF', 'BUR'];
  if (westCoast.includes(orig) && westCoast.includes(dest)) {
    return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const SEATS_AERO_API_KEY = Deno.env.get("SEATS_AERO_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body: QuoteRequest = await req.json();
    console.log("[SmartQuote-V2] Request:", body);

    const { 
      origin, 
      destination, 
      departure_date, 
      return_date, 
      passengers = 1,
      cabin_class = 'economy'
    } = body;

    if (!origin || !destination || !departure_date) {
      return new Response(JSON.stringify({
        success: false,
        message: "Need origin, destination, and departure date to generate a quote."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Check Alaska Airlines availability
    // ═══════════════════════════════════════════════════════════════════
    
    let alaskaAvailable = false;
    let alaskaPointsCost: number | null = null;
    
    // First, check route likelihood
    const likelyAlaskaRoute = isAlaskaRoute(origin, destination);
    console.log("[SmartQuote-V2] Likely Alaska route:", likelyAlaskaRoute);
    
    // If likely Alaska route, check Seats.aero for award availability
    if (likelyAlaskaRoute && SEATS_AERO_API_KEY) {
      try {
        const cabinMap: Record<string, string> = {
          'economy': 'economy',
          'premium_economy': 'premium',
          'business': 'business',
          'first': 'first'
        };
        
        const seatsResponse = await fetch(
          `https://seats.aero/api/availability?origin=${origin}&destination=${destination}&date=${departure_date}&cabin=${cabinMap[cabin_class] || 'economy'}&source=alaska`,
          {
            headers: {
              'Authorization': `Bearer ${SEATS_AERO_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (seatsResponse.ok) {
          const seatsData = await seatsResponse.json();
          if (seatsData.data && seatsData.data.length > 0) {
            alaskaAvailable = true;
            // Get points cost from response
            const alaskaFlights = seatsData.data.filter((f: any) => 
              f.source === 'alaska' || f.airline === 'AS'
            );
            if (alaskaFlights.length > 0) {
              alaskaPointsCost = Math.min(...alaskaFlights.map((f: any) => f.points || f.miles || 0));
            }
            console.log("[SmartQuote-V2] Alaska availability found, points:", alaskaPointsCost);
          }
        }
      } catch (e) {
        console.error("[SmartQuote-V2] Seats.aero check error:", e);
        // If API fails but route is likely Alaska, assume available
        alaskaAvailable = likelyAlaskaRoute;
      }
    } else {
      // No API key, use heuristic
      alaskaAvailable = likelyAlaskaRoute;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Get market price
    // ═══════════════════════════════════════════════════════════════════
    
    let marketPrice: number | null = null;
    
    if (PERPLEXITY_API_KEY) {
      try {
        const tripType = return_date ? "round-trip" : "one-way";
        const searchQuery = `Lowest ${cabin_class} ${tripType} flight price from ${origin} to ${destination} departing ${departure_date}${return_date ? ` returning ${return_date}` : ''} for ${passengers} passenger(s). Check Google Flights, Kayak, JustFly. Return just the lowest price number.`;

        const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: "You are a flight price researcher. Return ONLY the lowest price as a number, no currency symbol, no text." },
              { role: "user", content: searchQuery }
            ],
            max_tokens: 50
          })
        });

        if (perplexityRes.ok) {
          const perplexityData = await perplexityRes.json();
          const priceText = perplexityData.choices?.[0]?.message?.content || "";
          const priceMatch = priceText.match(/(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/);
          if (priceMatch) {
            marketPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            console.log("[SmartQuote-V2] Market price found:", marketPrice);
          }
        }
      } catch (e) {
        console.error("[SmartQuote-V2] Perplexity error:", e);
      }
    }

    // Fallback estimate
    if (!marketPrice) {
      const majorNorthAmericaAirports = [
        'JFK', 'LAX', 'ORD', 'DFW', 'ATL', 'DEN', 'SFO', 'SEA', 'MIA', 'BOS',
        'LAS', 'PHX', 'IAH', 'EWR', 'YYZ', 'YVR', 'YUL', 'YYC'
      ];

      const originCode = origin.toUpperCase();
      const destinationCode = destination.toUpperCase();
      const likelyNorthAmericaRoute =
        majorNorthAmericaAirports.includes(originCode) &&
        majorNorthAmericaAirports.includes(destinationCode);

      const isInternational = !likelyNorthAmericaRoute;
      const classMultiplier = cabin_class === 'first' ? 5 : cabin_class === 'business' ? 3 : 1;
      marketPrice = Math.round((isInternational ? 800 : 300) * (return_date ? 1 : 0.6) * passengers * classMultiplier);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Decision tree - Alaska first, then cards
    // ═══════════════════════════════════════════════════════════════════
    
    let bookingMethod: 'alaska_points' | 'alaska_card' | 'gift_card' | 'declined' = 'declined';
    let inventoryType: 'points' | 'gift_card' | 'none' = 'none';
    let inventoryId: string | null = null;
    let canFulfill = false;
    let reasoning = "";
    let discountPercent = 50; // Default 50% off market

    // Get pricing rules
    const { data: pricingRules } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (pricingRules) {
      for (const rule of pricingRules) {
        const minOk = !rule.min_market_price || marketPrice >= rule.min_market_price;
        const maxOk = !rule.max_market_price || marketPrice <= rule.max_market_price;
        if (minOk && maxOk) {
          discountPercent = rule.discount_percent;
          break;
        }
      }
    }

    const quotedPrice = Math.round((marketPrice * (1 - discountPercent / 100)) / 10) * 10;

    if (alaskaAvailable) {
      // ═══════════════════════════════════════════════════════════════════
      // ALASKA AVAILABLE: Check points first, then Alaska cards
      // ═══════════════════════════════════════════════════════════════════
      
      // Check Alaska points accounts
      const estimatedPointsNeeded = alaskaPointsCost || Math.round(marketPrice * 80); // ~80 points per dollar
      
      const { data: alaskaPoints } = await supabase
        .from('points_accounts')
        .select('*')
        .eq('status', 'active')
        .eq('airline', 'Alaska')
        .gte('points_balance', estimatedPointsNeeded)
        .order('points_balance', { ascending: false })
        .limit(1);

      if (alaskaPoints && alaskaPoints.length > 0) {
        bookingMethod = 'alaska_points';
        inventoryType = 'points';
        inventoryId = alaskaPoints[0].id;
        canFulfill = true;
        reasoning = `Alaska award booking: ${alaskaPoints[0].points_balance.toLocaleString()} points available`;
        console.log("[SmartQuote-V2] Using Alaska points:", alaskaPoints[0].id);
      } else {
        // Check Alaska gift cards
        const { data: alaskaCards } = await supabase
          .from('gift_cards')
          .select('*')
          .eq('status', 'available')
          .eq('airline', 'Alaska')
          .gte('balance', marketPrice * 0.4) // Need at least 40% in card
          .order('balance', { ascending: false })
          .limit(1);

        if (alaskaCards && alaskaCards.length > 0) {
          bookingMethod = 'alaska_card';
          inventoryType = 'gift_card';
          inventoryId = alaskaCards[0].id;
          canFulfill = true;
          reasoning = `Alaska gift card: $${alaskaCards[0].balance} available`;
          console.log("[SmartQuote-V2] Using Alaska card:", alaskaCards[0].id);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // NOT ON ALASKA: Cards only if ≤ $1000
    // ═══════════════════════════════════════════════════════════════════
    
    if (!canFulfill && !alaskaAvailable) {
      if (marketPrice <= 1000) {
        // Check any airline gift cards
        const { data: anyCards } = await supabase
          .from('gift_cards')
          .select('*')
          .eq('status', 'available')
          .gte('balance', marketPrice * 0.5)
          .order('balance', { ascending: false })
          .limit(1);

        if (anyCards && anyCards.length > 0) {
          bookingMethod = 'gift_card';
          inventoryType = 'gift_card';
          inventoryId = anyCards[0].id;
          canFulfill = true;
          reasoning = `Gift card booking: ${anyCards[0].airline} $${anyCards[0].balance}`;
          console.log("[SmartQuote-V2] Using generic card:", anyCards[0].id);
        }
      } else {
        // Price > $1000 and not on Alaska = DECLINE
        reasoning = `Route not available on Alaska and market price ($${marketPrice}) exceeds $1000 card limit`;
        console.log("[SmartQuote-V2] Declining - price too high for cards");
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Generate result and log quote
    // ═══════════════════════════════════════════════════════════════════
    
    let result: QuoteResult;

    if (canFulfill) {
      const { data: quoteLog, error: logError } = await supabase
        .from('quote_logs')
        .insert({
          customer_phone: body.customer_phone,
          customer_email: body.customer_email,
          customer_name: body.customer_name,
          route: `${origin} → ${destination}`,
          travel_dates: return_date ? `${departure_date} - ${return_date}` : departure_date,
          passengers,
          market_price: marketPrice,
          quoted_price: quotedPrice,
          discount_applied: discountPercent,
          payment_method: bookingMethod,
          booking_method: bookingMethod,
          alaska_available: alaskaAvailable,
          inventory_type: inventoryType,
          inventory_id: inventoryId,
          ticket_request_id: body.ticket_request_id || null,
          status: 'quoted',
          conversation_id: body.conversation_id,
          auto_approved: true
        })
        .select()
        .single();

      if (logError) {
        console.error("[SmartQuote-V2] Quote log error:", logError);
      }

      // Build next steps message
      let nextSteps = "";
      if (bookingMethod === 'alaska_points') {
        nextSteps = "Points booking - will be queued for manual execution via NeuralAgent";
      } else {
        nextSteps = "Card booking - Maya can call airline IVR to complete";
      }

      result = {
        success: true,
        quoted_price: quotedPrice,
        market_price: marketPrice,
        discount_percent: discountPercent,
        booking_method: bookingMethod,
        alaska_available: alaskaAvailable,
        inventory_type: inventoryType,
        inventory_id: inventoryId || undefined,
        message: `I can get you ${origin} to ${destination} for $${quotedPrice}. That's ${discountPercent}% off!`,
        reasoning,
        quote_id: quoteLog?.id,
        next_steps: nextSteps
      };
    } else {
      // DECLINED
      await supabase
        .from('quote_logs')
        .insert({
          customer_phone: body.customer_phone,
          customer_email: body.customer_email,
          customer_name: body.customer_name,
          route: `${origin} → ${destination}`,
          travel_dates: return_date ? `${departure_date} - ${return_date}` : departure_date,
          passengers,
          market_price: marketPrice,
          quoted_price: 0,
          payment_method: 'declined',
          booking_method: 'declined',
          alaska_available: alaskaAvailable,
          status: 'declined',
          conversation_id: body.conversation_id,
          auto_approved: false,
          admin_notes: reasoning
        });

      result = {
        success: false,
        market_price: marketPrice,
        booking_method: 'declined',
        alaska_available: alaskaAvailable,
        inventory_type: 'none',
        message: alaskaAvailable 
          ? `That route is tricky for us right now - we're low on Alaska inventory. Want me to submit a request and see what we can do?`
          : `I can't beat market on that one right now - the route's outside our sweet spot. Want me to check nearby airports or different dates?`,
        reasoning,
        next_steps: "Submit as manual ticket request for admin review"
      };
    }

    console.log("[SmartQuote-V2] Result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: unknown) {
    console.error("[SmartQuote-V2] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      success: false,
      alaska_available: false,
      message: "Hmm, something went wrong checking that route. Let me try again...",
      error: errorMessage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
