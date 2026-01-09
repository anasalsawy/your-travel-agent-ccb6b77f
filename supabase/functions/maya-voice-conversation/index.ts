import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maya's voice - Sarah (warm, natural female voice)
const MAYA_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

/**
 * MAYA VOICE CONVERSATION
 * 
 * This is the unified endpoint for voice calls with Maya.
 * ElevenLabs is used ONLY for voice (STT/TTS).
 * All intelligence, tools, and capabilities come from our ai-chat function.
 * 
 * Flow:
 * 1. Receive audio from caller → STT (ElevenLabs)
 * 2. Send text to ai-chat (OUR MAYA with ALL tools)
 * 3. Get Maya's response → TTS (ElevenLabs)
 * 4. Return audio to caller
 * 
 * This means Phone Maya = Website Maya = ONE MAYA with all powers!
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!ELEVENLABS_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    
    // Handle different input types
    let userText = "";
    let sessionId = "";
    let conversationId = "";
    let messageHistory: any[] = [];
    
    if (contentType.includes("multipart/form-data")) {
      // Audio input - need to transcribe first
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;
      sessionId = formData.get("session_id") as string || crypto.randomUUID();
      conversationId = formData.get("conversation_id") as string || "";
      const historyJson = formData.get("history") as string;
      
      if (historyJson) {
        try {
          messageHistory = JSON.parse(historyJson);
        } catch (e) {
          console.log("Could not parse history:", e);
        }
      }
      
      if (!audioFile) {
        return new Response(
          JSON.stringify({ error: "No audio file provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Step 1: Transcribing audio with ElevenLabs STT...");
      console.log("Audio file:", audioFile.name, "size:", audioFile.size, "type:", audioFile.type);

      // Step 1: Transcribe audio using ElevenLabs STT
      const sttFormData = new FormData();
      sttFormData.append("file", audioFile);
      sttFormData.append("model_id", "scribe_v1");
      sttFormData.append("language_code", "eng");

      const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: sttFormData,
      });

      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        console.error("STT Error:", sttResponse.status, errorText);
        throw new Error(`Speech-to-text failed: ${errorText}`);
      }

      const sttResult = await sttResponse.json();
      userText = sttResult.text;
      console.log("Transcribed text:", userText);

    } else if (contentType.includes("application/json")) {
      // Text input directly (for testing or WebSocket connections)
      const body = await req.json();
      userText = body.text || body.message || "";
      sessionId = body.session_id || crypto.randomUUID();
      conversationId = body.conversation_id || "";
      messageHistory = body.history || [];
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid content type. Use multipart/form-data (audio) or application/json (text)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userText || userText.trim() === "") {
      return new Response(
        JSON.stringify({ error: "No speech detected or empty message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Send to OUR Maya (ai-chat) with full context and tools
    console.log("Step 2: Sending to Maya (ai-chat) with all tools...");
    
    // Build message history for ai-chat
    const messages = [
      ...messageHistory,
      { role: "user", content: userText }
    ];

    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages,
        sessionId,
        conversationId,
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("ai-chat error:", aiChatResponse.status, errorText);
      throw new Error(`AI chat failed: ${errorText}`);
    }

    // Get conversation ID from response header
    const newConversationId = aiChatResponse.headers.get("X-Conversation-Id") || conversationId;

    // Parse the streaming response from ai-chat
    const responseText = await aiChatResponse.text();
    let mayaResponse = "";
    
    // Parse SSE format from ai-chat
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

    console.log("Maya's response:", mayaResponse.substring(0, 200) + "...");

    // Step 3: Convert Maya's response to speech using ElevenLabs TTS
    console.log("Step 3: Converting to speech with ElevenLabs TTS...");
    
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${MAYA_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: mayaResponse,
          model_id: "eleven_turbo_v2_5", // Fast, high quality for conversations
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error("TTS Error:", ttsResponse.status, errorText);
      throw new Error(`Text-to-speech failed: ${errorText}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);
    console.log("Audio generated, size:", audioBuffer.byteLength, "bytes");

    // Return both audio and text response
    return new Response(
      JSON.stringify({
        success: true,
        // User's transcribed speech
        user_text: userText,
        // Maya's text response (for display/logging)
        maya_text: mayaResponse,
        // Maya's voice response (base64 encoded MP3)
        audio: audioBase64,
        audio_format: "mp3",
        // Conversation tracking
        session_id: sessionId,
        conversation_id: newConversationId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Voice conversation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Try to generate an error response in Maya's voice
    try {
      const errorAudioResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${MAYA_VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "Hmm, I hit a little snag there. Give me just a second and try again.",
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.3,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (errorAudioResponse.ok) {
        const errorAudioBuffer = await errorAudioResponse.arrayBuffer();
        const errorAudioBase64 = base64Encode(errorAudioBuffer);
        
        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
            maya_text: "Hmm, I hit a little snag there. Give me just a second and try again.",
            audio: errorAudioBase64,
            audio_format: "mp3",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("Could not generate error audio:", e);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
