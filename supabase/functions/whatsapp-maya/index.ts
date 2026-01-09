import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP MAYA - TEXT CHAT BRIDGE
 * 
 * This webhook receives WhatsApp messages via Twilio.
 * Routes ALL intelligence to our ai-chat function.
 * Sends Maya's response back via Twilio WhatsApp.
 * 
 * WhatsApp Maya = Phone Maya = Website Maya = ONE MAYA brain!
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

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
    console.log("[WhatsApp Maya] Session:", sessionId);

    // Route to our ai-chat (Maya's brain)
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: `[WHATSAPP from ${fromNumber}] ${messageBody}` }],
        sessionId: sessionId,
        conversationId: sessionId,
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("[WhatsApp Maya] ai-chat error:", aiChatResponse.status, errorText);
      
      // Return TwiML error response
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Oops! Maya is having a moment. Try again in a sec!</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Parse SSE response from ai-chat
    const responseText = await aiChatResponse.text();
    let mayaResponse = "";
    
    for (const line of responseText.split("\n")) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.choices?.[0]?.delta?.content) {
            mayaResponse += data.choices[0].delta.content;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    // Clean response for WhatsApp (keep some formatting, limit length)
    mayaResponse = mayaResponse
      .replace(/\*\*/g, '*') // Convert double asterisk to single for WhatsApp bold
      .substring(0, 1500); // WhatsApp message limit

    console.log("[WhatsApp Maya] Response:", mayaResponse.substring(0, 200));

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
