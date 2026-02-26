import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP DEV AGENT - Direct Twilio Webhook
 * 
 * This is the Dev Agent's own webhook for WhatsApp/SMS.
 * No middleman — Twilio sends messages directly here.
 * 
 * Handles:
 * - Owner (admin) messages → Dev Agent with boss mode
 * - Verification PIN detection → forwards to admin
 * - Fatwa routing → dedicated fatwa callback
 * - Customer messages → Dev Agent
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string): Response {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + escapeXml(message) + "</Message></Response>",
    { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
  );
}

function emptyTwiml(): Response {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
  );
}

// Strip markdown for WhatsApp readability
function formatForWhatsApp(text: string): string {
  return text
    .replace(/\*\*/g, "*")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{3}[\s\S]*?`{3}/g, "[code block]")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

// Check for verification PINs
function detectVerificationPin(message: string): string | null {
  const patterns = [
    /(?:verification|verify|code|pin|otp)[\s:]*(\d{4,8})/i,
    /(\d{4,8})[\s]*(?:is your|is the|verification|code|pin)/i,
    /facebook[\s\S]*?(\d{4,8})/i,
    /meta[\s\S]*?(\d{4,8})/i,
    /whatsapp[\s\S]*?(\d{4,8})/i,
    /^\s*(\d{4,8})\s*$/,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  const FATWA_AGENT_ID = Deno.env.get("FATWA_AGENT_ID");
  const FATWA_TWILIO_NUMBER = Deno.env.get("FATWA_TWILIO_NUMBER");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ── Parse incoming Twilio payload ──
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let toNumber = "";
    let messageBody = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = (formData.get("From") as string) || "";
      toNumber = (formData.get("To") as string) || "";
      messageBody = (formData.get("Body") as string) ||
        (formData.get("SmsBody") as string) || "";
      console.log("[WA-DevAgent] From:", fromNumber, "| To:", toNumber, "| Msg:", messageBody);
    } else {
      try {
        const body = await req.json();
        fromNumber = body.From || body.from || "";
        toNumber = body.To || body.to || "";
        messageBody = body.Body || body.body || body.message || body.text || "";
        console.log("[WA-DevAgent] JSON payload:", fromNumber, messageBody.substring(0, 80));
      } catch {
        console.log("[WA-DevAgent] Could not parse body");
        return emptyTwiml();
      }
    }

    if (!messageBody) {
      console.log("[WA-DevAgent] Empty message from:", fromNumber);
      return emptyTwiml();
    }

    // ── Identify sender ──
    const normalizedFrom = fromNumber.replace(/\D/g, "");
    let adminPhone = "+17134698336";
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_phone")
        .maybeSingle();
      if (data?.value) adminPhone = data.value;
    } catch { /* use default */ }

    const normalizedAdmin = adminPhone.replace(/\D/g, "");
    const isFromAdmin =
      normalizedFrom === normalizedAdmin ||
      normalizedFrom.endsWith(normalizedAdmin) ||
      normalizedAdmin.endsWith(normalizedFrom);

    console.log("[WA-DevAgent] isAdmin:", isFromAdmin);

    // ── 📿 Fatwa routing ──
    const normalizedTo = toNumber.replace(/\D/g, "");
    const normalizedFatwa = FATWA_TWILIO_NUMBER?.replace(/\D/g, "") || "";
    const isFatwaNumber = normalizedFatwa &&
      (normalizedTo === normalizedFatwa ||
        normalizedTo.endsWith(normalizedFatwa) ||
        normalizedFatwa.endsWith(normalizedTo));

    if (FATWA_AGENT_ID && isFatwaNumber) {
      console.log("[WA-DevAgent] 📿 Fatwa routing for:", fromNumber);
      try {
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
        const resp = await fetch(SUPABASE_URL + "/functions/v1/fatwa-callback", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question: messageBody, phone_number: fromNumber }),
        });
        if (resp.ok) {
          return twiml("السلام عليكم ورحمة الله وبركاته 📿\n\nتم استلام سؤالك بنجاح. سيتصل بك الشيخ قريباً إن شاء الله.\n\nجزاك الله خيراً.");
        }
      } catch (e) {
        console.error("[WA-DevAgent] Fatwa callback failed:", e);
      }
      return twiml("عذراً، حدث خطأ. يرجى المحاولة لاحقاً.");
    }

    // ── 🔐 Verification PIN detection ──
    const pin = detectVerificationPin(messageBody);
    if (pin) {
      console.log("[WA-DevAgent] 🔐 PIN detected:", pin);
      // Forward to admin via WhatsApp
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
        try {
          const fmtAdmin = adminPhone.includes("whatsapp:") ? adminPhone : "whatsapp:" + adminPhone;
          const fmtFrom = TWILIO_PHONE_NUMBER.includes("whatsapp:") ? TWILIO_PHONE_NUMBER : "whatsapp:" + TWILIO_PHONE_NUMBER;
          await fetch(
            "https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_ACCOUNT_SID + "/Messages.json",
            {
              method: "POST",
              headers: {
                "Authorization": "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                From: fmtFrom,
                To: fmtAdmin,
                Body: "🔐 VERIFICATION PIN: " + pin + "\nFrom: " + fromNumber + "\nOriginal: \"" + messageBody + "\"",
              }),
            }
          );
          console.log("[WA-DevAgent] ✅ PIN forwarded to admin");
        } catch (e) {
          console.error("[WA-DevAgent] PIN forward error:", e);
        }
      }
      // Also email if available
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
      if (RESEND_API_KEY && ADMIN_EMAIL) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + RESEND_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Dev Agent <maya@your-travel-agent.net>",
              to: [ADMIN_EMAIL],
              subject: "🔐 Verification PIN: " + pin,
              html: "<h2>PIN: " + pin + "</h2><p>From: " + fromNumber + "</p><p>Message: " + messageBody + "</p>",
            }),
          });
        } catch { /* best effort */ }
      }
      return twiml("Got it! I've forwarded this verification code to the admin. 👍");
    }

    // ── 👑 Owner: check for quote reply ──
    if (isFromAdmin) {
      console.log("[WA-DevAgent] 👑 OWNER message");

      const isQuoteReply = /^\$?\d+|quote|price|offer|deal/i.test(messageBody.trim().split(" ")[0]);

      if (isQuoteReply) {
        const { data: pendingAlert } = await supabase
          .from("admin_alerts")
          .select("id, conversation_id")
          .eq("alert_type", "quote_request")
          .is("admin_response", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingAlert) {
          const { data: convo } = await supabase
            .from("ai_conversations")
            .select("customer_phone, session_id")
            .eq("id", pendingAlert.conversation_id)
            .single();

          if (convo?.customer_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
            const quoteMsg = "Hey! Great news! 🎉\n\n" + messageBody + "\n\nWant to proceed? Just reply here or visit yourtravelagent.net to book!\n\n- Maya ✈️";
            const fmtCust = convo.customer_phone.includes("whatsapp:") ? convo.customer_phone : "whatsapp:" + convo.customer_phone;
            const fmtFrom = TWILIO_PHONE_NUMBER.includes("whatsapp:") ? TWILIO_PHONE_NUMBER : "whatsapp:" + TWILIO_PHONE_NUMBER;

            const resp = await fetch(
              "https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_ACCOUNT_SID + "/Messages.json",
              {
                method: "POST",
                headers: {
                  "Authorization": "Basic " + btoa(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN),
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ From: fmtFrom, To: fmtCust, Body: quoteMsg }),
              }
            );

            if (resp.ok) {
              await supabase.from("admin_alerts").update({
                admin_response: messageBody,
                responded_at: new Date().toISOString(),
                is_read: true,
              }).eq("id", pendingAlert.id);

              await supabase.from("ai_conversations").update({
                status: "quote_delivered",
                needs_admin_attention: false,
              }).eq("id", pendingAlert.conversation_id);

              return twiml("✅ Quote sent to " + convo.customer_phone + "!");
            } else {
              const err = await resp.text();
              console.error("[WA-DevAgent] Quote send failed:", err);
              return twiml("❌ Failed to send quote: " + err.substring(0, 100));
            }
          }
        }
      }
    }

    // ── 🤖 Route to Dev Agent ──
    const isOwner = isFromAdmin;
    const sessionPrefix = isOwner ? "whatsapp-boss-" : "whatsapp-";
    const sessionId = sessionPrefix + normalizedFrom;

    // Get or create conversation
    let { data: convo } = await supabase
      .from("ai_conversations")
      .select("id, customer_id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!convo) {
      // Link customer profile
      let customerId = null;
      if (!isOwner) {
        const { data } = await supabase.rpc("get_or_create_customer_by_phone", { p_phone: fromNumber });
        customerId = data;
      }

      const { data: newConvo } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: sessionId,
          customer_phone: fromNumber,
          customer_id: customerId,
          owner_verified: isOwner,
          status: isOwner ? "owner_mode" : "active",
        })
        .select("id, customer_id")
        .single();
      convo = newConvo;
    } else if (isOwner) {
      await supabase.from("ai_conversations").update({ owner_verified: true, status: "owner_mode" }).eq("id", convo.id);
    } else if (!convo.customer_id) {
      const { data: custId } = await supabase.rpc("get_or_create_customer_by_phone", { p_phone: fromNumber });
      if (custId) {
        await supabase.rpc("link_conversation_to_customer", { p_conversation_id: convo.id, p_customer_id: custId });
      }
    }

    // Load recent history
    let recentMessages: Array<{ role: string; content: string }> = [];
    if (convo?.id) {
      const { data: prevMsgs } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (prevMsgs && prevMsgs.length > 0) {
        recentMessages = prevMsgs.reverse().map((m: any) => ({ role: m.role, content: m.content }));
      }
    }

    // Call Dev Agent
    console.log("[WA-DevAgent] 🤖 Calling dev-agent for:", fromNumber, isOwner ? "(owner)" : "(customer)");

    try {
      const devResp = await fetch(SUPABASE_URL + "/functions/v1/dev-agent", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...recentMessages, { role: "user", content: messageBody }],
        }),
      });

      const devResult = await devResp.json();
      let response = devResult?.content || "";

      // Compact action summary
      const actionLog = devResult?.action_log || [];
      let actionSummary = "";
      if (actionLog.length > 0) {
        const lines = actionLog.map((a: any) => (a.success ? "✅" : "❌") + " " + a.tool + ": " + a.args_summary);
        actionSummary = "\n\n🔧 _Actions:_\n" + lines.join("\n");
      }

      response = formatForWhatsApp(response);

      // WhatsApp ~1600 char limit
      const maxLen = 1500 - actionSummary.length;
      if (response.length > maxLen) {
        response = response.substring(0, maxLen - 3) + "...";
      }
      response = response + actionSummary;

      if (response) {
        // Save history
        if (convo?.id) {
          await supabase.from("ai_chat_messages").insert([
            { conversation_id: convo.id, role: "user", content: messageBody, metadata: { channel: "whatsapp", phone: fromNumber, is_owner: isOwner } },
            { conversation_id: convo.id, role: "assistant", content: response, metadata: { channel: "whatsapp", agent: "dev-agent", owner_mode: isOwner } },
          ]);
        }
        return twiml("🤖 " + response);
      }
    } catch (error) {
      console.error("[WA-DevAgent] Dev Agent call failed:", error);
    }

    return twiml("🤖 Hit a snag processing that. Try again?");
  } catch (error) {
    console.error("[WA-DevAgent] Error:", error);
    return twiml("Something went wrong. Visit yourtravelagent.net for help!");
  }
});
