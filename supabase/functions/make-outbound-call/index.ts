import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * MAKE OUTBOUND CALL
 * 
 * Initiates an outbound phone call using ElevenLabs Conversational AI.
 * 
 * IMPORTANT: For the call to use OUR Maya's brain, you must configure
 * the ElevenLabs agent to use a Server Tool that calls our elevenlabs-maya endpoint.
 * 
 * ElevenLabs Agent Configuration:
 * 1. Create agent in ElevenLabs dashboard
 * 2. Set a minimal system prompt (just routing instructions)
 * 3. Add Server Tool pointing to: https://wpwdxtyufpewdyffxlgo.supabase.co/functions/v1/elevenlabs-maya
 * 4. Configure the tool to be called for ALL user messages
 * 
 * This way:
 * - ElevenLabs handles voice (STT/TTS) and phone infrastructure
 * - OUR Maya handles all intelligence, tools, and responses
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, first_message, context, use_maya_brain } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID");
    const ELEVENLABS_PHONE_NUMBER_ID = Deno.env.get("ELEVENLABS_PHONE_NUMBER_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

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
          error: "ElevenLabs Agent ID and Phone Number ID are required for outbound calls.",
          setup_needed: true,
          instructions: [
            "1. Go to ElevenLabs Dashboard → Agents",
            "2. Create or select your Maya agent",
            "3. Get the Agent ID and Phone Number ID",
            "4. Add them as secrets: ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID",
            "",
            "IMPORTANT: To use OUR Maya's brain for calls:",
            "5. In ElevenLabs Agent → Tools → Add Server Tool",
            `6. Set URL to: ${SUPABASE_URL}/functions/v1/elevenlabs-maya`,
            "7. Configure the agent to call this tool for ALL user messages",
            "8. Set minimal system prompt: 'Route all conversation through the server tool'"
          ]
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number - ensure it has country code
    let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
    if (!formattedPhone.startsWith("+")) {
      if (formattedPhone.length === 10) {
        formattedPhone = "+1" + formattedPhone;
      } else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) {
        formattedPhone = "+" + formattedPhone;
      }
    }

    console.log(`[Outbound Call] Initiating call to: ${formattedPhone}`);
    console.log(`[Outbound Call] Using agent: ${ELEVENLABS_AGENT_ID}`);
    console.log(`[Outbound Call] Maya brain endpoint: ${SUPABASE_URL}/functions/v1/elevenlabs-maya`);

    // Build request body for ElevenLabs
    const requestBody: any = {
      agent_id: ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number: formattedPhone,
    };

    // Add conversation initiation data with context
    // This gets passed to the elevenlabs-maya endpoint as dynamic_variables
    requestBody.conversation_initiation_client_data = {
      dynamic_variables: {
        first_message: first_message || "Hey! This is Maya from Your Travel Agent. How are you doing today?",
        call_context: context || "Outbound call initiated by the team",
        company_name: "Your Travel Agent",
        agent_name: "Maya",
        maya_brain_url: `${SUPABASE_URL}/functions/v1/elevenlabs-maya`,
        use_maya_brain: use_maya_brain !== false // Default to true
      }
    };

    // Make the outbound call via ElevenLabs
    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[Outbound Call] ElevenLabs response:", response.status, responseText);

    if (!response.ok) {
      console.error("[Outbound Call] ElevenLabs API error:", response.status, responseText);
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

    console.log("[Outbound Call] Call initiated successfully:", result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Calling ${formattedPhone} now with Maya!`,
        note: "Maya is using her full brain with all tools for this call.",
        call_sid: result.callSid,
        conversation_id: result.conversation_id,
        maya_brain: `${SUPABASE_URL}/functions/v1/elevenlabs-maya`,
        ...result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Outbound Call] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to make call";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
