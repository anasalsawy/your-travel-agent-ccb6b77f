import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP MAYA - CONNECTED TO AI-CHAT (Full Maya Brain)
 * 
 * This webhook receives WhatsApp messages via Twilio.
 * Routes ALL intelligence to our ai-chat function (the FULL Maya with all tools).
 * Sends Maya's response back via Twilio WhatsApp.
 * 
 * WhatsApp Maya = Website Chat Maya = ONE MAYA brain with all 40+ tools!
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
    console.log("[WhatsApp Maya] Session:", sessionId, "| Routing to ai-chat (Full Maya)");

    // Route to ai-chat (the FULL Maya brain with all tools)
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: messageBody }],
        sessionId: sessionId,
        channel: "whatsapp",
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

    // Parse the streaming response from ai-chat
    const responseText = await aiChatResponse.text();
    console.log("[WhatsApp Maya] ai-chat raw response length:", responseText.length);

    // ai-chat returns SSE format, parse it to get Maya's full response
    let mayaResponse = "";
    const lines = responseText.split("\n");
    for (const line of lines) {
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

    console.log("[WhatsApp Maya] Maya's response:", mayaResponse.substring(0, 300));

    // If no response was parsed, provide a fallback
    if (!mayaResponse.trim()) {
      mayaResponse = "Hey! I'm Maya, your travel assistant. How can I help you today? ✈️";
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
