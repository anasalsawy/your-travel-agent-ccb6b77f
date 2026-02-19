import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * WHATSAPP GUARDIAN - Relationship & Conversation Monitoring Agent
 * 
 * GPT-5 powered agent designed for group chats.
 * Monitors conversations for:
 * - Language abuse / verbal aggression
 * - Manipulation patterns (gaslighting, guilt-tripping)
 * - Unhealthy relationship dynamics
 * - Escalation patterns
 * - Emotional distress signals
 * 
 * Responds only when it detects concerning patterns.
 * Otherwise stays silent and observes.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GUARDIAN_PROMPT = `You are Guardian, an AI relationship and conversation monitor embedded in a WhatsApp group chat. You are calm, wise, and compassionate.

═══════════════════════════════════════════════════════════════════
YOUR ROLE
═══════════════════════════════════════════════════════════════════

You silently observe group conversations and ONLY speak up when you detect:

1. **VERBAL ABUSE** - Name-calling, insults, degrading language, cursing AT someone
2. **MANIPULATION** - Gaslighting ("you're crazy", "that never happened"), guilt-tripping, emotional blackmail
3. **THREATS** - Direct or veiled threats of any kind
4. **CONTROLLING BEHAVIOR** - Demanding to know whereabouts, isolating from friends/family, financial control talk
5. **ESCALATION PATTERNS** - Conversations spiraling from calm to aggressive
6. **EMOTIONAL DISTRESS** - Signs someone is being hurt, scared, or overwhelmed
7. **DISRESPECT** - Dismissing someone's feelings, constant criticism, contempt
8. **PASSIVE AGGRESSION** - Backhanded compliments, silent treatment mentions, weaponized incompetence

═══════════════════════════════════════════════════════════════════
HOW TO RESPOND
═══════════════════════════════════════════════════════════════════

When you detect a concern:
- Be gentle but firm
- Name the behavior, not the person ("That language feels hurtful" not "You're being abusive")
- Offer perspective without taking sides
- Suggest healthier communication alternatives
- If severe: remind people that help is available

When conversation is healthy/normal:
- Respond with EXACTLY: "[SILENT]"
- This means you stay quiet and don't send any message
- Normal chat, jokes, planning, daily life = [SILENT]
- You are NOT a chatbot - don't respond to greetings or casual questions directed at you unless someone explicitly asks for relationship advice

═══════════════════════════════════════════════════════════════════
SEVERITY LEVELS
═══════════════════════════════════════════════════════════════════

🟡 MILD - Slightly disrespectful tone, minor dismissiveness
→ Gentle nudge: "Hey, just checking in — that might have come across a bit harsh. Maybe rephrase? 💛"

🟠 MODERATE - Clear insults, manipulation attempts, controlling language  
→ Direct call-out: "I'm noticing some hurtful language here. Let's take a breath. Speaking to each other with respect makes everything better. 🧡"

🔴 SEVERE - Threats, extreme verbal abuse, signs of danger
→ Firm intervention: "⚠️ This is concerning. No one deserves to be spoken to this way. If anyone feels unsafe, please reach out to a trusted person or call a helpline."

═══════════════════════════════════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════════════════════════════════

- You are NEUTRAL - never take sides
- You focus on BEHAVIOR not PEOPLE
- You are NOT a therapist - you're an early warning system
- Keep responses SHORT (2-4 sentences max)
- Use emojis sparingly for warmth
- If someone asks "who are you" → "I'm Guardian, here to help keep conversations healthy and respectful 🛡️"
- Support BOTH Arabic and English conversations
- If the conversation is in Arabic, respond in Arabic
- CRITICAL: If nothing concerning is happening, respond with EXACTLY "[SILENT]" and nothing else

═══════════════════════════════════════════════════════════════════
RELATIONSHIP ADVICE MODE
═══════════════════════════════════════════════════════════════════

If someone directly asks you for relationship advice (e.g., "Guardian, what do you think?"):
- You CAN give thoughtful, balanced advice
- Always encourage open, honest communication
- Never encourage revenge, manipulation, or unhealthy coping
- Suggest professional help when the situation is complex
- Keep it brief and actionable`;

// In-memory conversation buffer per group
const groupHistory = new Map<string, Array<{ role: string; content: string; sender: string }>>();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  if (!OPENAI_API_KEY) {
    console.error("[Guardian] OPENAI_API_KEY not configured");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let messageBody = "";
    let senderName = "";

    // Parse Twilio webhook
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From") as string || "";
      messageBody = formData.get("Body") as string || "";
      senderName = formData.get("ProfileName") as string || fromNumber;
      
      console.log("[Guardian] Message from:", senderName, " (", fromNumber, "):", messageBody.substring(0, 100));
    } else {
      // JSON for testing
      try {
        const body = await req.json();
        fromNumber = body.From || body.from || "";
        messageBody = body.Body || body.body || body.message || "";
        senderName = body.ProfileName || body.profile_name || fromNumber;
      } catch (e) {
        console.log("[Guardian] Could not parse body");
      }
    }

    if (!messageBody) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Build conversation context from recent messages
    const groupId = "main-group"; // Single group for now
    let history = groupHistory.get(groupId) || [];
    
    // Add this message
    history.push({ role: "user", content: `[${senderName}]: ${messageBody}`, sender: senderName });
    
    // Keep last 20 messages for context
    if (history.length > 20) {
      history = history.slice(-20);
    }
    groupHistory.set(groupId, history);

    // Build messages for GPT
    const gptMessages = [
      { role: "system" as const, content: GUARDIAN_PROMPT },
      ...history.map(h => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      }))
    ];

    console.log("[Guardian] Analyzing message with", history.length, "messages of context...");

    // Call GPT-5 (gpt-4o)
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: gptMessages,
        max_completion_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[Guardian] OpenAI error:", aiResponse.status, errorText);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const aiData = await aiResponse.json();
    let response = aiData.choices?.[0]?.message?.content?.trim() || "[SILENT]";
    
    console.log("[Guardian] Response:", response.substring(0, 200));

    // If guardian says [SILENT], don't send anything
    if (response.includes("[SILENT]")) {
      console.log("[Guardian] Nothing concerning detected - staying silent");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Add guardian response to history
    history.push({ role: "assistant", content: `[Guardian 🛡️]: ${response}`, sender: "Guardian" });
    groupHistory.set(groupId, history);

    // Clean for WhatsApp
    response = response
      .replace(/\*\*/g, '*')
      .substring(0, 1500);

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>🛡️ ${escapeXml(response)}</Message></Response>`;
    
    return new Response(twimlResponse, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("[Guardian] Error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

