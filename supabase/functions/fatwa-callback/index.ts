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

    // Generic first message - warm greeting without assuming it's a question
    // The agent will use the 'sms_content' dynamic variable to understand context
    const firstName = caller_name?.split(' ')[0] || '';
    const greeting = firstName 
      ? `السلام عليكم ورحمة الله وبركاته يا ${firstName}، `
      : `السلام عليكم ورحمة الله وبركاته، `;
    
    // Generic opening that works for any type of request
    const firstMessage = `${greeting}معك الشيخ صلاح الصبي. وصلتني رسالتك وأنا سعيد بالتواصل معك. بسم الله، تفضل.`;

    console.log("[Fatwa Callback] First message:", firstMessage);

    // FATWA_PHONE_NUMBER_ID must be the ElevenLabs phone_number_id (UUID), not the phone number
    const phoneNumberIdToUse = FATWA_PHONE_NUMBER_ID;

    // Try the Twilio outbound call endpoint first (more reliable for single calls)
    const singleCallPayload = {
      agent_id: FATWA_AGENT_ID,
      agent_phone_number_id: phoneNumberIdToUse,
      to_number: cleanPhone,
      first_message: firstMessage,
      // Pass SMS content as dynamic variable - agent uses this for context
      // Named 'sms_content' to be generic (could be question, topic, request, etc.)
      conversation_initiation_client_data: {
        sms_content: smsContent,
        caller_name: caller_name || "المتصل",
      },
    };

    console.log("[Fatwa Callback] Calling ElevenLabs outbound-call API...");
    console.log("[Fatwa Callback] Using phone_number_id:", phoneNumberIdToUse);
    console.log("[Fatwa Callback] Payload:", JSON.stringify(singleCallPayload, null, 2));

    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(singleCallPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Fatwa Callback] Outbound call failed:", response.status, errorText);
      
      // Try batch API as fallback
      console.log("[Fatwa Callback] Trying batch-call API as fallback...");
      
      const batchCallPayload = {
        calls: [
          {
            phone_number: cleanPhone,
            agent_id: FATWA_AGENT_ID,
            agent_phone_number_id: phoneNumberIdToUse,
            first_message: firstMessage,
            conversation_initiation_client_data: {
              sms_content: smsContent,
              caller_name: caller_name || "المتصل",
            },
            language: "ar",
          }
        ]
      };

      const batchResponse = await fetch("https://api.elevenlabs.io/v1/convai/batch-call", {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchCallPayload),
      });

      if (!batchResponse.ok) {
        const batchError = await batchResponse.text();
        console.error("[Fatwa Callback] Batch call also failed:", batchResponse.status, batchError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to initiate callback", 
            details: batchError,
            attempted_number: cleanPhone 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const batchData = await batchResponse.json();
      console.log("[Fatwa Callback] ✅ Batch call initiated:", batchData);

      return new Response(
        JSON.stringify({ 
          success: true, 
          method: "batch-call",
          message: "تم استلام سؤالك وسيتم الاتصال بك قريباً إن شاء الله",
          message_en: "Your question has been received. You will receive a call shortly, God willing.",
          call_data: batchData 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("[Fatwa Callback] ✅ Outbound call initiated:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        method: "outbound-call",
        message: "تم استلام سؤالك وسيتم الاتصال بك قريباً إن شاء الله",
        message_en: "Your question has been received. You will receive a call shortly, God willing.",
        call_data: data 
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
