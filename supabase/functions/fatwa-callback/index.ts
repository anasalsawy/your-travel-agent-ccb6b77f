import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * FATWA CALLBACK SERVICE
 * 
 * Flow:
 * 1. Receives SMS with a religious question
 * 2. Triggers ElevenLabs batch call to the sender's number
 * 3. Agent (Sheikh Salah) calls back with the answer
 * 4. Engages in full discussion until caller is satisfied
 * 
 * The agent ID is stored as FATWA_AGENT_ID secret
 */

interface FatwaRequest {
  question: string;
  phone_number: string;
  caller_name?: string;
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
    console.error("[Fatwa Callback] FATWA_PHONE_NUMBER_ID is not configured - calls will use wrong caller ID!");
  }

  try {
    const body: FatwaRequest = await req.json();
    const { question, phone_number, caller_name } = body;

    if (!question || !phone_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: question, phone_number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number - must be E.164 format
    let cleanPhone = phone_number.replace(/\D/g, '');
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }

    console.log("[Fatwa Callback] 📞 Initiating callback to:", cleanPhone);
    console.log("[Fatwa Callback] ❓ Question:", question.substring(0, 100));

    // Build a comprehensive first message that:
    // 1. Greets the caller
    // 2. Identifies the Sheikh
    // 3. States the question they asked
    // 4. Begins answering it
    const firstName = caller_name?.split(' ')[0] || '';
    const greeting = firstName 
      ? `السلام عليكم ورحمة الله وبركاته يا ${firstName}، `
      : `السلام عليكم ورحمة الله وبركاته، `;
    
    // The first message should immediately provide context and start answering
    const firstMessage = `${greeting}معك الشيخ صلاح الصبي. وصلني سؤالك الآن وأريد أن أجيبك عليه. سألتني: "${question}". هذا سؤال مهم جداً، دعني أجيبك عليه بالتفصيل إن شاء الله.`;

    console.log("[Fatwa Callback] First message:", firstMessage);

    // Use the dedicated fatwa phone number ID, fallback to generic if not set
    const phoneNumberIdToUse = FATWA_PHONE_NUMBER_ID || Deno.env.get("ELEVENLABS_PHONE_NUMBER_ID");

    // Try the Twilio outbound call endpoint first (more reliable for single calls)
    const singleCallPayload = {
      agent_id: FATWA_AGENT_ID,
      agent_phone_number_id: phoneNumberIdToUse,
      to_number: cleanPhone,
      first_message: firstMessage,
      // Pass the question as dynamic variable so the agent's prompt can reference it
      conversation_initiation_client_data: {
        question: question,
        caller_name: caller_name || "السائل",
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
              question: question,
              caller_name: caller_name || "السائل",
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
