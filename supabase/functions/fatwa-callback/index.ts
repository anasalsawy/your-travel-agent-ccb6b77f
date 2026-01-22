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

    console.log("[Fatwa Callback] 📞 Initiating BATCH callback to:", cleanPhone);
    console.log("[Fatwa Callback] 📝 SMS Content:", smsContent.substring(0, 100));

    // First message - warm greeting 
    // The agent's system prompt should use {{sms_content}} to read the user's question
    const firstMessage = `السلام عليكم ورحمة الله وبركاته، معك المساعد الذكي لفضيلة الدكتور العلامة صلاح الصاوي. وصلتنا رسالتك وسعداء بالتواصل معك إن شاء الله.`;

    console.log("[Fatwa Callback] First message:", firstMessage);
    console.log("[Fatwa Callback] Using phone_number_id:", FATWA_PHONE_NUMBER_ID);

    /**
     * BATCH CALL API - Proper way to pass dynamic variables
     * 
     * The batch-call API uses a 'recipients' array where each recipient
     * can have custom dynamic variables that the agent can access via {{variable_name}}
     * 
     * This is different from the outbound-call API which uses conversation_initiation_client_data
     */
    const batchCallPayload = {
      call_name: `Fatwa Call - ${new Date().toISOString()}`,
      agent_id: FATWA_AGENT_ID,
      agent_phone_number_id: FATWA_PHONE_NUMBER_ID,
      scheduled_time_unix: null, // Immediate call
      recipients: [
        {
          phone_number: cleanPhone,
          // Dynamic variables - these become available as {{variable_name}} in the agent
          sms_content: smsContent,
          caller_name: caller_name || "المتصل",
          // Override first message for this recipient
          first_message: firstMessage,
        }
      ]
    };

    console.log("[Fatwa Callback] Calling ElevenLabs BATCH-CALL API...");
    console.log("[Fatwa Callback] Payload:", JSON.stringify(batchCallPayload, null, 2));

    // ElevenLabs docs/UI have used different endpoints across releases.
    // We'll try the currently documented path first, then fall back to older variants.
    const candidateUrls = [
      "https://api.elevenlabs.io/v1/convai/batch-calling/create",
      "https://api.elevenlabs.io/v1/convai/batch-calling",
      // Legacy endpoint some workspaces still use
      "https://api.elevenlabs.io/v1/convai/batch-call",
    ];

    const headers = {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    } as const;

    let lastErrorText = "";
    let lastStatus = 0;
    let usedUrl = "";

    for (const url of candidateUrls) {
      usedUrl = url;
      console.log("[Fatwa Callback] Trying ElevenLabs batch endpoint:", url);

      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(batchCallPayload),
      });

      if (r.ok) {
        const data = await r.json();
        console.log("[Fatwa Callback] ✅ Batch call initiated:", data);

        return new Response(
          JSON.stringify({
            success: true,
            method: "batch-call",
            elevenlabs_endpoint: url,
            message: "تم استلام سؤالك وسيتم الاتصال بك قريباً إن شاء الله",
            message_en: "Your question has been received. You will receive a call shortly, God willing.",
            call_data: data,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      lastStatus = r.status;
      lastErrorText = await r.text();
      console.error("[Fatwa Callback] Batch endpoint failed:", url, r.status, lastErrorText);

      // If endpoint doesn't exist or doesn't allow POST, try next candidate.
      if (r.status === 404 || r.status === 405) continue;

      // Other errors (e.g., 401/403/422) are meaningful; stop and return.
      break;
    }

    return new Response(
      JSON.stringify({
        error: "Failed to initiate callback",
        details: lastErrorText,
        status: lastStatus,
        attempted_number: cleanPhone,
        attempted_endpoint: usedUrl,
        payload_sent: batchCallPayload,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // (success response is returned above as soon as a candidate endpoint works)

  } catch (error: unknown) {
    console.error("[Fatwa Callback] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
