import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP MAYA - CONNECTED TO ELEVENLABS MAYA
 * 
 * This webhook receives WhatsApp messages via Twilio.
 * Routes ALL intelligence to our elevenlabs-maya function (the ONE Maya brain).
 * Sends Maya's response back via Twilio WhatsApp.
 * 
 * WhatsApp Maya = Phone Maya = Website Maya = ONE MAYA brain (ElevenLabs)!
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let toNumber = "";
    let messageBody = "";

    // Twilio sends form-urlencoded data
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From") as string || "";
      toNumber = formData.get("To") as string || "";
      messageBody = formData.get("Body") as string || "";
      
      console.log("[WhatsApp Maya] From:", fromNumber, "| Message:", messageBody);
    } else if (contentType.includes("application/json")) {
      // Also support JSON for testing
      const body = await req.json();
      fromNumber = body.From || body.from || "";
      toNumber = body.To || body.to || "";
      messageBody = body.Body || body.body || body.message || body.text || "";
    }

    if (!messageBody) {
      console.log("[WhatsApp Maya] Empty message received");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Use phone number as session ID for conversation continuity
    const sessionId = `whatsapp-${fromNumber.replace(/\D/g, '')}`;
    console.log("[WhatsApp Maya] Session:", sessionId, "| Routing to ElevenLabs Maya");

    // Route to elevenlabs-maya (the ONE Maya brain)
    const elevenLabsMayaResponse = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-maya`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        // ElevenLabs Maya expects these fields
        userMessage: messageBody,
        sessionId: sessionId,
        channel: "whatsapp",
        phoneNumber: fromNumber,
      }),
    });

    if (!elevenLabsMayaResponse.ok) {
      const errorText = await elevenLabsMayaResponse.text();
      console.error("[WhatsApp Maya] elevenlabs-maya error:", elevenLabsMayaResponse.status, errorText);
      
      // Return TwiML error response
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Oops! Maya is having a moment. Try again in a sec!</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Parse response from elevenlabs-maya
    const responseData = await elevenLabsMayaResponse.json();
    console.log("[WhatsApp Maya] ElevenLabs Maya response:", JSON.stringify(responseData).substring(0, 300));

    // Extract Maya's response - elevenlabs-maya returns { intent, data, ... }
    let mayaResponse = "";
    
    // The elevenlabs-maya function returns structured data
    // We need to format it nicely for WhatsApp
    if (responseData.data) {
      if (typeof responseData.data === "string") {
        mayaResponse = responseData.data;
      } else if (responseData.data.message) {
        mayaResponse = responseData.data.message;
      } else if (responseData.data.response) {
        mayaResponse = responseData.data.response;
      } else if (responseData.intent === "vouchers" && responseData.data.vouchers) {
        // Format voucher data for WhatsApp
        const vouchers = responseData.data.vouchers.slice(0, 3);
        mayaResponse = `🎫 Here are some flight vouchers:\n\n`;
        vouchers.forEach((v: any) => {
          mayaResponse += `✈️ *${v.airline}* - ${v.title}\n`;
          mayaResponse += `💰 $${v.sale_price} (${v.discount_percent}% off)\n`;
          if (v.expiry_date) mayaResponse += `📅 Expires: ${new Date(v.expiry_date).toLocaleDateString()}\n`;
          mayaResponse += `\n`;
        });
        mayaResponse += `Want details on any of these? Just ask!`;
      } else if (responseData.intent === "ticket_requests" && responseData.data.requests) {
        const requests = responseData.data.requests.slice(0, 3);
        mayaResponse = `📋 Your ticket requests:\n\n`;
        requests.forEach((r: any) => {
          mayaResponse += `🛫 ${r.origin} → ${r.destination}\n`;
          mayaResponse += `📅 ${new Date(r.departure_date).toLocaleDateString()}\n`;
          mayaResponse += `📊 Status: ${r.status}\n\n`;
        });
      } else if (responseData.intent === "error") {
        mayaResponse = responseData.data.message || "Something went wrong. Try again!";
      } else {
        // Generic data formatting
        mayaResponse = JSON.stringify(responseData.data, null, 2).substring(0, 1400);
      }
    } else if (responseData.message) {
      mayaResponse = responseData.message;
    } else {
      mayaResponse = "Hey! I'm Maya, your travel assistant. How can I help you today? 🌍✈️";
    }

    // Clean response for WhatsApp (keep some formatting, limit length)
    mayaResponse = mayaResponse
      .replace(/\*\*/g, '*') // Convert double asterisk to single for WhatsApp bold
      .substring(0, 1500); // WhatsApp message limit

    console.log("[WhatsApp Maya] Final response:", mayaResponse.substring(0, 200));

    // Return TwiML response for Twilio
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(mayaResponse)}</Message></Response>`;
    
    return new Response(twimlResponse, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("[WhatsApp Maya] Error:", error);
    
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Something went wrong. Try again!</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }
});

// Escape special XML characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
