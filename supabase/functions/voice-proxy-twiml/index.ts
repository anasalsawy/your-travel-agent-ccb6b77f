import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - TWIML WEBHOOK
 * 
 * Returns TwiML that puts the called party into a conference.
 * The conference allows us to play audio (TTS) into the call later.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const conferenceName = url.searchParams.get("conference") || "default_proxy";

  console.log("[VoiceProxy TwiML] Joining conference:", conferenceName);

  // TwiML: greet briefly, then join conference
  // startConferenceOnEnter=true means conference starts when this participant joins
  // endConferenceOnExit=true means conference ends when they hang up
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold, connecting you now.</Say>
  <Conference 
    startConferenceOnEnter="true"
    endConferenceOnExit="true"
    beep="false"
    waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.soft-rock"
    waitMethod="GET"
    maxParticipants="10"
  >${conferenceName}</Conference>
</Response>`;

  return new Response(twiml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/xml",
    },
  });
});
