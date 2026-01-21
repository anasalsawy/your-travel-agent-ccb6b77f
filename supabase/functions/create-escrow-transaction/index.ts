import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EscrowTransactionRequest {
  voucherId: string;
  amount: number;
  currency: string;
  voucherTitle: string;
  voucherDescription: string;
  buyerEmail: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const escrowApiEmail = Deno.env.get("ESCROW_API_EMAIL");
    const escrowApiKey = Deno.env.get("ESCROW_API_KEY");

    if (!escrowApiEmail || !escrowApiKey) {
      console.error("Missing Escrow.com API credentials");
      return new Response(
        JSON.stringify({ error: "Escrow API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: EscrowTransactionRequest = await req.json();
    const { voucherId, amount, currency, voucherTitle, voucherDescription, buyerEmail } = body;

    console.log("Creating Escrow transaction:", { voucherId, amount, buyerEmail });

    // Verify the voucher exists and is available
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", voucherId)
      .single();

    if (voucherError || !voucher) {
      console.error("Voucher not found:", voucherError);
      return new Response(
        JSON.stringify({ error: "Voucher not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (voucher.status !== "available") {
      return new Response(
        JSON.stringify({ error: "Voucher is no longer available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Escrow.com transaction
    // Using Escrow.com API v4 (2017-09-01)
    const escrowApiUrl = "https://api.escrow.com/2017-09-01/transaction";
    
    const escrowTransactionPayload = {
      parties: [
        {
          customer: buyerEmail,
          role: "buyer",
        },
        {
          customer: escrowApiEmail,
          role: "seller",
        },
      ],
      currency: currency.toLowerCase(),
      description: `Purchase of ${voucherTitle} - ${voucherDescription}`,
      items: [
        {
          title: voucherTitle,
          description: voucherDescription || `Airline voucher: ${voucherTitle}`,
          type: "general_merchandise",
          quantity: 1,
          schedule: [
            {
              payer_customer: buyerEmail,
              amount: amount.toFixed(2),
              beneficiary_customer: escrowApiEmail,
            },
          ],
          inspection_period: 259200, // 3 days in seconds
        },
      ],
    };

    console.log("Sending to Escrow API:", JSON.stringify(escrowTransactionPayload));

    // Create transaction on Escrow.com
    const authString = btoa(`${escrowApiEmail}:${escrowApiKey}`);
    
    const escrowResponse = await fetch(escrowApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${authString}`,
      },
      body: JSON.stringify(escrowTransactionPayload),
    });

    const escrowData = await escrowResponse.json();
    
    if (!escrowResponse.ok) {
      console.error("Escrow API error:", escrowData);
      return new Response(
        JSON.stringify({ 
          error: "Failed to create Escrow transaction", 
          details: escrowData 
        }),
        { status: escrowResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Escrow transaction created:", escrowData);

    // Create order in our database with escrow transaction ID
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        voucher_id: voucherId,
        amount_paid: amount,
        payment_method: "escrow",
        payment_status: "pending",
        order_status: "pending",
        customer_email: buyerEmail,
        delivery_info: JSON.stringify({
          escrow_transaction_id: escrowData.id,
          escrow_status: "created",
        }),
      })
      .select()
      .single();

    if (orderError) {
      console.error("Failed to create order:", orderError);
      return new Response(
        JSON.stringify({ error: "Failed to create order", details: orderError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Order created:", order.id);

    // Return the Escrow.com transaction details with payment URL
    const escrowPaymentUrl = `https://www.escrow.com/transactions/${escrowData.id}`;
    
    return new Response(
      JSON.stringify({
        success: true,
        orderId: order.id,
        escrowTransactionId: escrowData.id,
        escrowPaymentUrl: escrowPaymentUrl,
        message: "Escrow transaction created successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
