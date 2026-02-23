import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - LISTENER TWIML
 * 
 * Returns TwiML that puts the listener (you) into the conference MUTED.
 * You can hear everything but your mic is off — you type to speak instead.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const conferenceName = url.searchParams.get("conference") || "default_proxy";

  console.log("[VoiceProxy ListenerTwiML] Joining conference (muted):", conferenceName);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">You are now listening. Type on the computer to speak.</Say>
  <Conference 
    startConferenceOnEnter="false"
    endConferenceOnExit="false"
    muted="true"
    beep="false"
    waitUrl=""
  >${conferenceName}</Conference>
</Response>`;

  return new Response(twiml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/xml",
    },
  });
});
