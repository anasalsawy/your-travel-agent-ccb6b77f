import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < ab.length; i++) out |= ab[i] ^ bb[i];
  return out === 0;
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const c of bytes) bin += String.fromCharCode(c);
  return btoa(bin);
}

/**
 * TWILIO STATUS CALLBACK WEBHOOK
 * Twilio will POST delivery updates (queued/sent/delivered/failed/undelivered).
 * We store them in notification_log so we can confirm whether a text truly delivered.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing backend env vars");
    return new Response("misconfigured", { status: 500, headers: corsHeaders });
  }

  try {
    // Twilio sends application/x-www-form-urlencoded
    const form = await req.formData();
    const MessageSid = String(form.get("MessageSid") || "");
    const MessageStatus = String(form.get("MessageStatus") || "");
    const To = String(form.get("To") || "");
    const From = String(form.get("From") || "");
    const ErrorCode = form.get("ErrorCode") ? String(form.get("ErrorCode")) : null;
    const ErrorMessage = form.get("ErrorMessage") ? String(form.get("ErrorMessage")) : null;

    // Optional signature validation (recommended)
    if (TWILIO_AUTH_TOKEN) {
      const signature = req.headers.get("x-twilio-signature") || "";
      // Twilio signature is based on full URL + sorted POST params
      const url = req.url;
      const keys = Array.from(form.keys()).sort();
      let data = url;
      for (const k of keys) data += k + String(form.get(k) ?? "");
      const expected = await hmacSha1Base64(TWILIO_AUTH_TOKEN, data);
      if (!timingSafeEqual(signature, expected)) {
        console.warn("Twilio signature mismatch (continuing anyway)");
      }
    }

    console.log("[Twilio Callback]", { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update existing log row if present
    if (MessageSid) {
      await supabase
        .from("notification_log")
        .update({
          status: MessageStatus || "unknown",
          error: ErrorMessage,
          payload: {
            twilio_sid: MessageSid,
            to: To,
            from: From,
            status: MessageStatus,
            error_code: ErrorCode,
            error_message: ErrorMessage,
          },
        })
        .eq("event_type", "sms_sent")
        .contains("payload", { twilio_sid: MessageSid });

      // Also insert an immutable status event row
      await supabase.from("notification_log").insert({
        event_type: "sms_status",
        recipient: To || null,
        status: MessageStatus || "unknown",
        error: ErrorMessage,
        payload: {
          twilio_sid: MessageSid,
          to: To,
          from: From,
          status: MessageStatus,
          error_code: ErrorCode,
          error_message: ErrorMessage,
        },
      });
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("Twilio callback error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
