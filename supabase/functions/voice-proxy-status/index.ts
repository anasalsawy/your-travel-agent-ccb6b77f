import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * VOICE PROXY - STATUS CALLBACK
 * 
 * Receives Twilio call status updates (ringing, answered, completed, etc.)
 * These are stored so the frontend can poll for call status.
 */

// In-memory status store (edge function instances are ephemeral, but sufficient for active calls)
const callStatuses = new Map<string, { status: string; timestamp: string; duration?: string }>();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const conferenceName = url.searchParams.get("conference") || "";

  // GET: Return current status for a conference
  if (req.method === "GET") {
    const status = callStatuses.get(conferenceName);
    return new Response(
      JSON.stringify(status || { status: "unknown" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // POST: Twilio status callback
  try {
    const form = await req.formData();
    const callStatus = String(form.get("CallStatus") || "unknown");
    const callDuration = form.get("CallDuration") ? String(form.get("CallDuration")) : undefined;
    const callSid = String(form.get("CallSid") || "");

    console.log("[VoiceProxy Status]", { conferenceName, callStatus, callSid, callDuration });

    callStatuses.set(conferenceName, {
      status: callStatus,
      timestamp: new Date().toISOString(),
      duration: callDuration,
    });

    // Clean up old entries (keep last 100)
    if (callStatuses.size > 100) {
      const oldest = callStatuses.keys().next().value;
      if (oldest) callStatuses.delete(oldest);
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("[VoiceProxy Status] Error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
