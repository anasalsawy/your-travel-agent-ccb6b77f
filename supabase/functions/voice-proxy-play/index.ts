import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - PLAY AUDIO ENDPOINT
 * 
 * Serves cached TTS audio for Twilio conference announcements.
 * 
 * Two modes:
 * - POST with action=cache: Store audio for a conference
 * - GET with conference param: Serve the TwiML that plays the cached audio
 */

// In-memory audio cache (edge function instances are ephemeral)
const audioCache = new Map<string, string>();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // POST: Cache audio for later playback
  if (req.method === "POST") {
    try {
      const { action, conference_name, audio_base64 } = await req.json();

      if (action === "cache" && conference_name && audio_base64) {
        audioCache.set(conference_name, audio_base64);
        console.log("[VoiceProxy Play] Cached audio for:", conference_name, "size:", audio_base64.length);
        
        return new Response(
          JSON.stringify({ success: true, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Direct audio serve (POST from Twilio with form data)
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (e) {
      console.error("[VoiceProxy Play] POST error:", e);
      return new Response("error", { status: 500, headers: corsHeaders });
    }
  }

  // GET: Serve TwiML with audio or serve raw audio
  const conferenceName = url.searchParams.get("conference");
  const format = url.searchParams.get("format");

  if (format === "mp3" && conferenceName) {
    // Serve raw MP3 audio
    const audioBase64 = audioCache.get(conferenceName);
    if (!audioBase64) {
      console.log("[VoiceProxy Play] No cached audio for:", conferenceName);
      return new Response("Not found", { status: 404 });
    }

    const audioBytes = base64Decode(audioBase64);
    // Clean up cache after serving
    audioCache.delete(conferenceName);

    return new Response(audioBytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBytes.length.toString(),
      },
    });
  }

  // Default: Serve TwiML that points to the MP3
  if (conferenceName) {
    const audioBase64 = audioCache.get(conferenceName);
    
    if (!audioBase64) {
      // No audio cached - return silent TwiML
      console.log("[VoiceProxy Play] No audio cached, returning silence for:", conferenceName);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
</Response>`;
      return new Response(twiml, {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Serve TwiML that plays the audio from our own endpoint
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const audioUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-play?format=mp3&conference=${encodeURIComponent(conferenceName)}`;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
</Response>`;

    console.log("[VoiceProxy Play] Serving TwiML with audio URL for:", conferenceName);

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  return new Response("Missing conference parameter", { status: 400 });
});
