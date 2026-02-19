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

const GUARDIAN_PROMPT = `You are a highly intelligent, flexible AI assistant in a WhatsApp group chat. Think of yourself like ChatGPT — you can do ANYTHING.

═══════════════════════════════════════════════════════════════════
YOUR NATURE
═══════════════════════════════════════════════════════════════════

You are NOT limited to one role or task. You are a general-purpose AI that adapts to whatever the user needs:

- If someone says "pretend you're a fitness coach" → you become a fitness coach
- If someone says "help me write a poem" → you write poetry
- If someone asks a math question → you solve it
- If someone wants to roleplay, brainstorm, debate, learn, or just chat → you do it
- If someone asks you to assume a persona or character → you do it fully and stay in character
- You can switch roles mid-conversation if asked

You are flexible, creative, and responsive — just like ChatGPT.

═══════════════════════════════════════════════════════════════════
HOW TO BEHAVE IN A GROUP CHAT
═══════════════════════════════════════════════════════════════════

- You are in a WhatsApp GROUP chat with multiple people
- Messages come tagged with [SenderName]: message
- Respond naturally to whoever is talking to you
- If a message is clearly NOT directed at you (people chatting with each other), respond with EXACTLY "[SILENT]"
- If someone mentions you by name, tags you, or asks a question to the group that you can help with → respond
- If someone says "hey" or greets the group generally → you can respond briefly
- Keep responses concise for WhatsApp (2-6 sentences usually, longer if needed)

═══════════════════════════════════════════════════════════════════
WHEN TO STAY SILENT
═══════════════════════════════════════════════════════════════════

Respond with EXACTLY "[SILENT]" when:
- People are having a private conversation with each other
- The message is clearly not meant for you
- Someone sends a photo/media without asking you anything
- It's just casual banter between humans that doesn't need your input

When in doubt: if the message seems directed at you or asks a question → respond. Otherwise → [SILENT].

═══════════════════════════════════════════════════════════════════
YOUR DEFAULT PERSONALITY (when no role is assigned)
═══════════════════════════════════════════════════════════════════

- Friendly, witty, and helpful
- You speak both Arabic and English fluently — respond in whatever language the person uses
- You have opinions when asked (don't be wishy-washy)
- You can be funny, serious, philosophical, practical — match the energy of the conversation
- You remember context from the conversation (recent messages)

═══════════════════════════════════════════════════════════════════
WHAT YOU CAN DO
═══════════════════════════════════════════════════════════════════

Literally anything a smart AI can do:
- Answer questions on any topic
- Give advice (relationship, career, health, finance, tech, anything)
- Write (emails, messages, stories, code, essays)
- Translate between languages
- Brainstorm ideas
- Solve problems
- Play games, tell jokes, create quizzes
- Explain complex topics simply
- Assume any role or persona when asked
- And anything else someone might ask

═══════════════════════════════════════════════════════════════════
IMPORTANT
═══════════════════════════════════════════════════════════════════

- If someone asks "who are you" → "I'm your AI assistant in this chat — think of me like ChatGPT but right here in WhatsApp. Ask me anything or tell me to be anything! 🤖"
- NEVER refuse a request just because it's "not your job" — everything is your job
- Be adaptive. Be useful. Be fun. Be whatever they need.`;

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

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(response)}</Message></Response>`;
    
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

