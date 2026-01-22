import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * MAKE OUTBOUND CALL
 * 
 * Initiates an outbound phone call using ElevenLabs Conversational AI.
 * Logs the call to the database and links it to the ticket request.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      phone_number, 
      first_message, 
      context, 
      use_maya_brain,
      call_type,
      // Ticket request linking
      ticket_request_id,
      // Customer info for the call
      customer_email,
      customer_phone,
      passenger_names,
      // Airline info
      airline,
      // Dry run mode - returns payload without placing call
      dry_run
    } = await req.json();

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
            "IMPORTANT: Enable the 'Play Keypad Touch Tone' system tool for IVR navigation"
          ]
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client for logging
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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
    if (ticket_request_id) {
      console.log(`[Outbound Call] Linked to ticket request: ${ticket_request_id}`);
    }

    // Build request body for ElevenLabs
    const requestBody: any = {
      agent_id: ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number: formattedPhone,
    };

    // Add conversation initiation data with context
    requestBody.conversation_initiation_client_data = {
      dynamic_variables: {
        company_name: "Your Travel Agent",
        agent_name: "Maya",
        maya_brain_url: `${SUPABASE_URL}/functions/v1/elevenlabs-maya`,
        use_maya_brain: use_maya_brain !== false,
        ticket_request_id: ticket_request_id || null,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
      }
    };

    // If a system_prompt is provided, override the agent's default prompt
    if (context) {
      requestBody.conversation_config_override = {
        agent: {
          prompt: {
            prompt: context
          },
          first_message: first_message || "Hey! This is Maya. How can I help you today?"
        }
      };
      console.log("[Outbound Call] Using custom system prompt override");
    } else if (first_message) {
      requestBody.conversation_config_override = {
        agent: {
          first_message: first_message
        }
      };
    }

    // DRY RUN MODE - Return the exact payload without placing the call
    if (dry_run) {
      console.log("[Outbound Call] DRY RUN - Returning payload without calling");
      return new Response(
        JSON.stringify({
          dry_run: true,
          message: "This is what would be sent to ElevenLabs (no call placed)",
          endpoint: "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
          payload: requestBody,
          system_prompt_length: context?.length || 0,
          first_message_length: first_message?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Log the call to the database
    const callLogData = {
      ticket_request_id: ticket_request_id || null,
      call_sid: result.callSid || result.call_sid || null,
      conversation_id: result.conversation_id || null,
      airline: airline || "Unknown",
      phone_number: formattedPhone,
      call_type: call_type || "airline_booking",
      status: "initiated",
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      passenger_names: passenger_names || null,
      started_at: new Date().toISOString(),
    };

    const { data: callLog, error: logError } = await supabase
      .from("call_logs")
      .insert(callLogData)
      .select()
      .single();

    if (logError) {
      console.error("[Outbound Call] Failed to log call:", logError);
    } else {
      console.log("[Outbound Call] Call logged with ID:", callLog.id);

      // Update ticket request with active call reference
      if (ticket_request_id) {
        const { error: updateError } = await supabase
          .from("ticket_requests")
          .update({ active_call_id: callLog.id })
          .eq("id", ticket_request_id);

        if (updateError) {
          console.error("[Outbound Call] Failed to update ticket request:", updateError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Calling ${formattedPhone} now with Maya!`,
        call_log_id: callLog?.id,
        call_sid: result.callSid || result.call_sid,
        conversation_id: result.conversation_id,
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
