import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FATWA CALLBACK SERVICE
 * 
 * Flow:
 * 1. Receives SMS with any religious topic (question, advice request, discussion, etc.)
 * 2. Triggers ElevenLabs outbound call to the sender's number
 * 3. Agent (Sheikh Salah) calls back with a generic greeting
 * 4. The SMS content is passed as a dynamic variable for context
 * 5. Agent engages naturally based on the caller's actual intent
 * 
 * The agent ID is stored as FATWA_AGENT_ID secret
 * The phone_number_id (not the phone number itself!) is stored as FATWA_PHONE_NUMBER_ID
 */

interface FatwaRequest {
  message: string;        // The SMS content (could be question, topic, request for advice, etc.)
  phone_number: string;
  caller_name?: string;
  // Legacy field name support
  question?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const FATWA_AGENT_ID = Deno.env.get("FATWA_AGENT_ID");
  const FATWA_PHONE_NUMBER_ID = Deno.env.get("FATWA_PHONE_NUMBER_ID"); // Dedicated fatwa line

  if (!ELEVENLABS_API_KEY) {
    console.error("[Fatwa Callback] ELEVENLABS_API_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "ElevenLabs API key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!FATWA_AGENT_ID) {
    console.error("[Fatwa Callback] FATWA_AGENT_ID is not configured");
    return new Response(
      JSON.stringify({ error: "Fatwa Agent ID not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!FATWA_PHONE_NUMBER_ID) {
    console.error("[Fatwa Callback] FATWA_PHONE_NUMBER_ID is not configured!");
    return new Response(
      JSON.stringify({ 
        error: "Fatwa Phone Number ID not configured",
        hint: "FATWA_PHONE_NUMBER_ID should be the ElevenLabs phone_number_id (UUID format), NOT the phone number itself"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: FatwaRequest = await req.json();
    // Support both 'message' (new) and 'question' (legacy) field names
    const smsContent = body.message || body.question;
    const { phone_number, caller_name } = body;

    if (!smsContent || !phone_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: message (or question), phone_number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number - must be E.164 format
    let cleanPhone = phone_number.replace(/\D/g, '');
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }

    console.log("[Fatwa Callback] 📞 Initiating callback to:", cleanPhone);
    console.log("[Fatwa Callback] 📝 SMS Content:", smsContent.substring(0, 100));

    // First message - warm greeting 
    // The agent's system prompt should use {{sms_content}} to read the user's question
    const firstMessage = `السلام عليكم ورحمة الله وبركاته، معك المساعد الذكي لفضيلة الدكتور العلامة صلاح الصاوي. وصلتنا رسالتك وسعداء بالتواصل معك إن شاء الله.`;

    console.log("[Fatwa Callback] First message:", firstMessage);
    console.log("[Fatwa Callback] Using phone_number_id:", FATWA_PHONE_NUMBER_ID);

    // Use the proven working single outbound-call endpoint.
    // We still pass the user's SMS as a dynamic variable so the agent can reference it.
    const outboundPayload: Record<string, unknown> = {
      agent_id: FATWA_AGENT_ID,
      agent_phone_number_id: FATWA_PHONE_NUMBER_ID,
      to_number: cleanPhone,
      conversation_initiation_client_data: {
        dynamic_variables: {
          sms_content: smsContent,
          caller_name: caller_name || "المتصل",
        },
      },
      // Override the first message so the agent starts with the intended greeting.
      conversation_config_override: {
        agent: {
          first_message: firstMessage,
        },
      },
    };

    console.log("[Fatwa Callback] Calling ElevenLabs outbound-call...");
    console.log("[Fatwa Callback] Payload:", JSON.stringify(outboundPayload, null, 2));

    const r = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(outboundPayload),
    });

    const responseText = await r.text();
    console.log("[Fatwa Callback] ElevenLabs response:", r.status, responseText);

    if (!r.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to initiate callback",
          status: r.status,
          details: responseText,
          attempted_number: cleanPhone,
          payload_sent: outboundPayload,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data: unknown = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    return new Response(
      JSON.stringify({
        success: true,
        method: "outbound-call",
        message: "تم استلام رسالتك وسيتم الاتصال بك قريباً إن شاء الله",
        message_en: "Your message has been received. You will receive a call shortly, God willing.",
        call_data: data,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Fatwa Callback] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
