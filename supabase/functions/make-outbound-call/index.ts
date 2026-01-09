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
    const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID");
    const ELEVENLABS_PHONE_NUMBER_ID = Deno.env.get("ELEVENLABS_PHONE_NUMBER_ID");

    if (!ELEVENLABS_API_KEY) {
      console.error("Missing ELEVENLABS_API_KEY");
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ELEVENLABS_AGENT_ID || !ELEVENLABS_PHONE_NUMBER_ID) {
      console.error("Missing ELEVENLABS_AGENT_ID or ELEVENLABS_PHONE_NUMBER_ID");
      return new Response(
        JSON.stringify({ 
          error: "ElevenLabs Agent ID and Phone Number ID are required for outbound calls. Please configure them in your secrets.",
          setup_needed: true,
          instructions: "Go to ElevenLabs dashboard > Agents > Your Agent > Phone Numbers to get the agent_id and phone_number_id"
        }),
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
    console.log(`Using agent: ${ELEVENLABS_AGENT_ID}, phone: ${ELEVENLABS_PHONE_NUMBER_ID}`);

    // Build conversation initiation data if provided
    const requestBody: any = {
      agent_id: ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number: formattedPhone,
    };

    // Always include conversation initiation data with proper context
    requestBody.conversation_initiation_client_data = {
      dynamic_variables: {
        first_message: first_message || "Hey! This is Maya from Your Travel Agent. How are you doing today?",
        call_context: context || "General travel inquiry call",
        company_name: "Your Travel Agent",
        agent_name: "Maya",
        conversation_style: "warm, friendly, conversational, take your time, never rush, ask follow-up questions, be genuinely interested"
      }
    };

    // Use ElevenLabs Conversational AI to make the outbound call
    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("ElevenLabs API response:", response.status, responseText);

    if (!response.ok) {
      console.error("ElevenLabs API error:", response.status, responseText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to initiate call", 
          details: responseText,
          status: response.status 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log("Call initiated successfully:", result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Calling ${formattedPhone} now...`,
        call_sid: result.callSid,
        conversation_id: result.conversation_id,
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
