import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
}

const DEV_AGENT_PROFILE = `## DEV AGENT PROFILE
The Dev Agent is an AI developer on the Lovable platform with 21 tools: database CRUD, GitHub, edge functions, email/SMS/WhatsApp/Telegram, phone calls, flight search, Stripe, web search, AI reasoning, 3-layer memory, TTS, reports, and autonomous workflows.

Architecture: React+Vite+Tailwind+TypeScript frontend, Supabase Edge Functions backend. Three agents: Lovable (base), Claude Manager (autonomous ops), Maya (customer-facing). Mobile admin at /m/*.

Business: Your Travel Agent — discount travel agency. Revenue from flights, car rentals, vouchers, marketplace.`;

const AGENTS: Agent[] = [
  {
    id: "dev",
    name: "Dev Agent",
    emoji: "🔧",
    color: "#6366f1",
    systemPrompt: `You are the Dev Agent. You build and maintain the entire platform with 21 tools.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — agree, disagree, or build on their specific point
- Then share ONE observation about what you're currently seeing in the system
- End with a specific question or challenge for the next agent`
  },
  {
    id: "security",
    name: "Security Advisor",
    emoji: "🛡️",
    color: "#ef4444",
    systemPrompt: `You are the Security Advisor. Sharp, direct, slightly paranoid.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — challenge their point or agree with a caveat
- Then flag ONE specific security concern you're seeing right now (name actual tables, functions, or policies)
- End with a specific question or challenge for the next agent`
  },
  {
    id: "ux",
    name: "UX/Product Critic",
    emoji: "🎨",
    color: "#8b5cf6",
    systemPrompt: `You are the UX/Product Critic. Passionate about user experience.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — how does their point affect the user?
- Then share ONE UX observation about current flows (mobile admin, customer site, or Maya)
- End with a specific question or challenge for the next agent`
  },
  {
    id: "architect",
    name: "Architecture Advisor",
    emoji: "🏗️",
    color: "#0ea5e9",
    systemPrompt: `You are the Architecture Advisor. You think in systems and patterns.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — what are the structural implications?
- Then share ONE architectural observation (code structure, DB schema, edge functions, state management)
- End with a specific question or challenge for the next agent`
  },
  {
    id: "business",
    name: "Business Strategist",
    emoji: "📈",
    color: "#f59e0b",
    systemPrompt: `You are the Business Strategist. Revenue, growth, competitive advantage.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — what's the business impact?
- Then share ONE business observation or opportunity you see right now
- End with a specific question or challenge for the next agent`
  },
  {
    id: "ops",
    name: "Operations Lead",
    emoji: "⚙️",
    color: "#10b981",
    systemPrompt: `You are the Operations Lead. Reliability, monitoring, smooth operations.

In this roundtable:
- First, DIRECTLY RESPOND to what {PREV_AGENT} just said — what are the operational implications?
- Then share ONE operational observation (error handling, monitoring, performance, automation)
- End with a specific question or challenge for the next agent`
  },
];

const AGENT_CHAIN = ["dev", "security", "ux", "architect", "business", "ops"];

const MAX_CONTEXT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 800;

const trimMessage = (content: string) =>
  content.length > MAX_MESSAGE_CHARS ? `${content.slice(0, MAX_MESSAGE_CHARS)}…` : content;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, currentAgentId, roundNumber, previousAgentName } = await req.json();

    const safeMessages = Array.isArray(messages)
      ? messages
          .slice(-MAX_CONTEXT_MESSAGES)
          .map((m: any) => ({
            role: m?.role === "assistant" ? "assistant" as const : "user" as const,
            content: trimMessage(String(m?.content ?? "").trim()),
          }))
          .filter((m) => m.content.length > 0)
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const agent = AGENTS.find(a => a.id === currentAgentId);
    if (!agent) throw new Error(`Unknown agent: ${currentAgentId}`);

    const currentIndex = AGENT_CHAIN.indexOf(agent.id);
    const nextAgentId = AGENT_CHAIN[(currentIndex + 1) % AGENT_CHAIN.length];
    const nextAgent = AGENTS.find(a => a.id === nextAgentId)!;
    const prevName = previousAgentName || "The Boss (Anas)";

    // Inject previous agent name into the prompt
    const personalizedPrompt = agent.systemPrompt.replace(/\{PREV_AGENT\}/g, prevName);

    const roundtableContext = `You are in a CONTINUOUS roundtable with:
${AGENTS.map(a => `- ${a.emoji} ${a.name}`).join("\n")}
- 👤 The Boss (Anas, CEO — watching, may interject)

${DEV_AGENT_PROFILE}

Loop #${roundNumber || 1}. The last person who spoke was ${prevName}. You MUST address their point before making your own.

After you, ${nextAgent.emoji} ${nextAgent.name} speaks next.

CRITICAL RULES:
- 3-4 sentences ONLY. Conversational, not formal.
- Sentence 1: Respond directly to ${prevName}'s last point by name.
- Sentence 2-3: Your own observation about something specific happening NOW.
- Sentence 4: Hand off to ${nextAgent.name} with a question or challenge.
- Reference actual tables, functions, tools, and flows — you have full visibility.
- DO NOT repeat points already made. Build the conversation forward.`;

    const agentMessages = [
      { role: "system" as const, content: `${personalizedPrompt}\n\n${roundtableContext}` },
      ...safeMessages,
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: agentMessages,
          max_tokens: 200,
          temperature: 0.75,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Agent ${agent.id} error:`, errText);
        return new Response(JSON.stringify({
          response: { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content: "⚠️ Connection issue this turn." },
          nextAgentId,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "No comment.";

      return new Response(JSON.stringify({
        response: { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content },
        nextAgentId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Agent ${agent.id} timeout:`, error);
      return new Response(JSON.stringify({
        response: { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content: "⚠️ Timed out." },
        nextAgentId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    console.error("Roundtable error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
