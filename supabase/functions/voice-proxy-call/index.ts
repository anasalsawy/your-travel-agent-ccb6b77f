import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - INITIATE CALL
 * 
 * Starts a Twilio conference call to a target number.
 * The conference allows us to inject TTS audio later.
 * 
 * Flow:
 * 1. Create a Twilio call to the target number
 * 2. The TwiML puts the target into a conference room
 * 3. We return the conference name + call SID for later audio injection
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, listener_phone } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "phone_number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      return new Response(
        JSON.stringify({ error: "Twilio not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number
    let formattedPhone = phone_number.replace(/[^0-9+]/g, "");
    if (!formattedPhone.startsWith("+")) {
      if (formattedPhone.length === 10) formattedPhone = "+1" + formattedPhone;
      else if (formattedPhone.length === 11 && formattedPhone.startsWith("1")) formattedPhone = "+" + formattedPhone;
    }

    // Generate unique conference name
    const conferenceName = `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // TwiML webhook URL - we'll use a simple TwiML that joins a conference
    const twimlUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-twiml?conference=${encodeURIComponent(conferenceName)}`;

    // Initiate the call via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    const authString = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    // Status callback for call events
    const statusCallbackUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-status?conference=${encodeURIComponent(conferenceName)}`;

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: formattedPhone,
        Url: twimlUrl,
        StatusCallback: statusCallbackUrl,
        StatusCallbackEvent: "initiated ringing answered completed",
        StatusCallbackMethod: "POST",
        Record: "false",
      }).toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[VoiceProxy] Twilio error:", response.status, responseText);
      return new Response(
        JSON.stringify({ error: "Failed to initiate call", details: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log("[VoiceProxy] Call initiated:", result.sid, "Conference:", conferenceName);

    // Also call the listener (your phone) into the conference, muted
    let listenerSid = null;
    if (listener_phone) {
      let formattedListener = listener_phone.replace(/[^0-9+]/g, "");
      if (!formattedListener.startsWith("+")) {
        if (formattedListener.length === 10) formattedListener = "+1" + formattedListener;
        else if (formattedListener.length === 11 && formattedListener.startsWith("1")) formattedListener = "+" + formattedListener;
      }

      const listenerTwimlUrl = `${SUPABASE_URL}/functions/v1/voice-proxy-listener-twiml?conference=${encodeURIComponent(conferenceName)}`;

      try {
        const listenerRes = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${authString}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: TWILIO_PHONE_NUMBER,
            To: formattedListener,
            Url: listenerTwimlUrl,
            Record: "false",
          }).toString(),
        });

        if (listenerRes.ok) {
          const listenerData = await listenerRes.json();
          listenerSid = listenerData.sid;
          console.log("[VoiceProxy] Listener call initiated:", listenerSid);
        } else {
          console.error("[VoiceProxy] Failed to call listener:", await listenerRes.text());
        }
      } catch (e) {
        console.error("[VoiceProxy] Listener call error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        call_sid: result.sid,
        listener_sid: listenerSid,
        conference_name: conferenceName,
        to: formattedPhone,
        status: result.status || "queued",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[VoiceProxy] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
