import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, first_message, context } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!ELEVENLABS_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number - ensure it has country code
    let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
    if (!formattedPhone.startsWith("+")) {
      // Assume US number if no country code
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) {
        formattedPhone = "+" + formattedPhone;
      }
    }

    console.log(`Initiating outbound call to: ${formattedPhone}`);

    // Build the system prompt with context
    const systemPrompt = `You are Maya, an AI travel agent from Your Travel Agent. You're calling on behalf of the business.
${context ? `Context for this call: ${context}` : ""}

Be professional, friendly, and helpful. Introduce yourself naturally. Keep the conversation focused and efficient.
If they're busy, offer to call back at a better time.`;

    // Use ElevenLabs Conversational AI to make the outbound call
    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound_call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: formattedPhone,
        from: TWILIO_PHONE_NUMBER,
        twilio_account_sid: TWILIO_ACCOUNT_SID,
        twilio_auth_token: TWILIO_AUTH_TOKEN,
        agent_config: {
          prompt: {
            prompt: systemPrompt,
          },
          first_message: first_message || "Hi, this is Maya from Your Travel Agent. How are you doing today?",
          language: "en",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to initiate call", 
          details: errorText,
          status: response.status 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Call initiated successfully:", result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Calling ${formattedPhone} now...`,
        call_sid: result.call_sid || result.callSid,
        ...result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error making outbound call:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to make call";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
