import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - SPEAK INTO CALL
 * 
 * Takes text, converts to speech via ElevenLabs TTS with a chosen voice,
 * then plays the audio into the active Twilio conference.
 * 
 * Flow:
 * 1. Receive text + voice_id + conference_name
 * 2. Generate TTS audio via ElevenLabs (streaming for speed)
 * 3. Announce the audio into the Twilio conference
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice_id, conference_name } = await req.json();

    if (!text || !conference_name) {
      return new Response(
        JSON.stringify({ error: "text and conference_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Twilio not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default voice: Roger (male, natural)
    const selectedVoice = voice_id || "CwhRBWXzGAHq8TQ4Fs17";

    console.log("[VoiceProxy Speak] Generating TTS for:", text.slice(0, 50), "voice:", selectedVoice);

    // Step 1: Generate TTS audio via ElevenLabs
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5", // Fastest model for low latency
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: 1.0,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("[VoiceProxy Speak] TTS error:", ttsResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "TTS generation failed", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);
    
    console.log("[VoiceProxy Speak] TTS generated, size:", audioBuffer.byteLength);

    // Step 2: Create a temporary TwiML bin that plays this audio
    // We'll use a data URI approach via a TwiML endpoint
    const playTwimlUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-play?audio=${encodeURIComponent(audioBase64.slice(0, 100))}&conference=${encodeURIComponent(conference_name)}`;

    // Step 3: Announce audio into the conference using Twilio Conferences API
    // We need to find the conference SID first
    const authString = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    // Find the conference by name
    const confListUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Conferences.json?FriendlyName=${encodeURIComponent(conference_name)}&Status=in-progress`;
    
    const confResponse = await fetch(confListUrl, {
      headers: { "Authorization": `Basic ${authString}` },
    });

    if (!confResponse.ok) {
      console.error("[VoiceProxy Speak] Conference lookup failed:", confResponse.status);
      return new Response(
        JSON.stringify({ error: "Conference not found or not active" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const confData = await confResponse.json();
    
    if (!confData.conferences || confData.conferences.length === 0) {
      return new Response(
        JSON.stringify({ error: "Conference not active. The other party may have hung up." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conferenceSid = confData.conferences[0].sid;
    console.log("[VoiceProxy Speak] Found conference SID:", conferenceSid);

    // Get participants in the conference
    const participantsUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Conferences/${conferenceSid}/Participants.json`;
    const partResponse = await fetch(participantsUrl, {
      headers: { "Authorization": `Basic ${authString}` },
    });

    const partData = await partResponse.json();
    
    if (!partData.participants || partData.participants.length === 0) {
      return new Response(
        JSON.stringify({ error: "No participants in conference" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use conference announcement - plays audio to all participants
    // We'll create a TwiML endpoint that serves the audio
    const announceTwiml = `${SUPABASE_URL}/functions/v1/voice-proxy-play?id=${Date.now()}`;

    // Store the audio temporarily for the play endpoint to serve
    // We'll use an in-memory approach by passing via Twilio's <Play> with a hosted URL
    
    // Alternative: Update the participant's call with new TwiML
    // This is more reliable - we update the call to play audio then rejoin conference
    const participantCallSid = partData.participants[0].call_sid;
    
    // Create TwiML that plays the audio then returns to conference
    const playAndReturnTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>data:audio/mpeg;base64,${audioBase64}</Play>
  <Conference 
    startConferenceOnEnter="true"
    endConferenceOnExit="true"
    beep="false"
    waitUrl=""
  >${conference_name}</Conference>
</Response>`;

    // Twilio doesn't support data URIs in <Play>. 
    // Instead, we'll use the Twilio conference announcement API
    // by updating the conference with an announcement URL
    
    // Best approach: Use Twilio's Conference Participants update to play audio
    // We need to serve the MP3 from an endpoint
    
    // Store audio in a simple KV approach using the conference name
    // and have voice-proxy-play serve it
    
    // For now, use Twilio's <Say> as fallback for the announcement approach
    // Actually, the best way is to announce via conference update
    
    const announceUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-play`;
    
    // POST the audio to our play endpoint to cache it, then announce
    const cacheResponse = await fetch(announceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "cache",
        conference_name,
        audio_base64: audioBase64,
      }),
    });

    if (!cacheResponse.ok) {
      console.error("[VoiceProxy Speak] Failed to cache audio");
    }

    // Now announce the audio to the conference
    const announceResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Conferences/${conferenceSid}.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          AnnounceUrl: `${announceUrl}?conference=${encodeURIComponent(conference_name)}`,
          AnnounceMethod: "GET",
        }).toString(),
      }
    );

    if (!announceResponse.ok) {
      const errText = await announceResponse.text();
      console.error("[VoiceProxy Speak] Announce failed:", announceResponse.status, errText);
      
      // Fallback: Update participant call with TwiML containing <Say>
      // This works but removes them from conference temporarily
      return new Response(
        JSON.stringify({ error: "Failed to announce audio", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[VoiceProxy Speak] Audio announced to conference successfully");

    return new Response(
      JSON.stringify({
        success: true,
        text,
        voice_id: selectedVoice,
        audio_size: audioBuffer.byteLength,
        conference: conference_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[VoiceProxy Speak] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
