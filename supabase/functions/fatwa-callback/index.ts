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

    // Build the first message that greets and immediately addresses the question
    const firstName = caller_name?.split(' ')[0] || '';
    const greeting = firstName 
      ? `السلام عليكم ورحمة الله وبركاته ${firstName}، `
      : `السلام عليكم ورحمة الله وبركاته، `;
    
    const firstMessage = `${greeting}وصلني سؤالك وأريد أن أجيبك عليه بإذن الله. سألت: ${question}`;

    // Use ElevenLabs Batch Calling API
    // POST /v1/convai/batch-call
    const batchCallPayload = {
      calls: [
        {
          phone_number: cleanPhone,
          agent_id: FATWA_AGENT_ID,
          // Conversation initiation data - these become dynamic variables in the agent
          conversation_initiation_client_data: {
            // The question to be answered
            question: question,
            // Caller name if available
            caller_name: caller_name || "السائل",
            // Override first message to immediately address the question
            first_message: firstMessage,
          },
          // Additional settings
          language: "ar", // Arabic
        }
      ]
    };

    console.log("[Fatwa Callback] Calling ElevenLabs batch API with payload:", JSON.stringify(batchCallPayload, null, 2));

    const response = await fetch("https://api.elevenlabs.io/v1/convai/batch-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchCallPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Fatwa Callback] ElevenLabs batch call failed:", response.status, errorText);
      
      // Try alternative: single outbound call endpoint
      console.log("[Fatwa Callback] Trying alternative outbound-call endpoint...");
      
      const singleCallPayload = {
        agent_id: FATWA_AGENT_ID,
        agent_phone_number_id: Deno.env.get("ELEVENLABS_PHONE_NUMBER_ID"),
        to_number: cleanPhone,
        conversation_initiation_client_data: {
          question: question,
          caller_name: caller_name || "السائل",
        },
        first_message: firstMessage,
      };
      
      const altResponse = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(singleCallPayload),
      });
      
      if (!altResponse.ok) {
        const altError = await altResponse.text();
        console.error("[Fatwa Callback] Alternative call also failed:", altResponse.status, altError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to initiate callback", 
            details: altError,
            attempted_number: cleanPhone 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const altData = await altResponse.json();
      console.log("[Fatwa Callback] ✅ Alternative call initiated:", altData);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "تم استلام سؤالك وسيتم الاتصال بك قريباً إن شاء الله",
          call_data: altData 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("[Fatwa Callback] ✅ Batch call initiated:", data);

    return new Response(
      JSON.stringify({ 
        success: true, 
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
