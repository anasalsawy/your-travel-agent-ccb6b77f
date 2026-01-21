import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Send WhatsApp Quote
 * 
 * Called when admin submits a quote response - sends the quote to the customer via WhatsApp
 * Also updates the admin_alert with the response
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error("[Send WhatsApp Quote] Twilio credentials not configured");
    return new Response(
      JSON.stringify({ error: "Twilio not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { alertId, quote, phoneNumber } = await req.json();

    if (!alertId || !quote || !phoneNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: alertId, quote, phoneNumber" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Send WhatsApp Quote] Sending quote to:", phoneNumber);
    console.log("[Send WhatsApp Quote] Quote:", quote);

    // Format the WhatsApp message
    const message = `Hey! Great news from Your Travel Agent! 🎉\n\n${quote}\n\nWant to proceed? Just reply here or visit yourtravelagent.net to book!\n\n- Maya ✈️`;

    // Format phone number for WhatsApp
    const formattedPhone = phoneNumber.startsWith("whatsapp:") 
      ? phoneNumber 
      : `whatsapp:${phoneNumber}`;

    const fromNumber = TWILIO_PHONE_NUMBER.startsWith("whatsapp:")
      ? TWILIO_PHONE_NUMBER
      : `whatsapp:${TWILIO_PHONE_NUMBER}`;

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: formattedPhone,
        Body: message,
      }),
    });

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("[Send WhatsApp Quote] Twilio error:", twilioResult);
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: twilioResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Send WhatsApp Quote] Message sent successfully:", twilioResult.sid);

    // Update the admin_alert with the response
    const { error: updateError } = await supabase
      .from("admin_alerts")
      .update({
        admin_response: quote,
        responded_at: new Date().toISOString(),
        is_read: true,
      })
      .eq("id", alertId);

    if (updateError) {
      console.error("[Send WhatsApp Quote] Error updating alert:", updateError);
    }

    // Update the conversation status
    const { data: alert } = await supabase
      .from("admin_alerts")
      .select("conversation_id")
      .eq("id", alertId)
      .single();

    if (alert?.conversation_id) {
      await supabase
        .from("ai_conversations")
        .update({ 
          status: "quote_sent",
          needs_admin_attention: false 
        })
        .eq("id", alert.conversation_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageSid: twilioResult.sid,
        message: "Quote sent successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Send WhatsApp Quote] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
