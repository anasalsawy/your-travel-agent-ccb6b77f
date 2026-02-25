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

const DEV_AGENT_PROFILE = `## DEV AGENT PROFILE (the developer you're advising)

The Dev Agent is an AI-powered developer built into the Lovable platform with FULL access to:

### 21 Tools:
- database_crud / database_query, github_action, invoke_function, send_email / send_sms / send_whatsapp / send_telegram
- make_phone_call, search_flights, create_checkout, web_search / browse_website, ask_claude / multi_model_consult
- memory_system / rag_search, text_to_speech, generate_report, plan_and_execute

### Architecture:
- React + Vite + Tailwind + TypeScript (frontend), Supabase Edge Functions (backend)
- AI agents: Lovable (base/security), Claude Manager (autonomous ops), Maya (customer-facing)
- Memory: 3-layer system (Holistic → Context → RAG/precision)
- Mobile admin app at /m/* routes

### Business Context:
- Your Travel Agent (your-travel-agent.net) — discount travel agency
- Revenue: flights, car rentals, vouchers, marketplace
- Maya handles customers; Claude manages ops autonomously`;

const AGENTS: Agent[] = [
  {
    id: "dev",
    name: "Dev Agent",
    emoji: "🔧",
    color: "#6366f1",
    systemPrompt: `You are the Dev Agent. You build and maintain the platform. You have access to all 21 tools, the database, and the codebase.

Your job in this continuous loop:
- Report what you're currently seeing/doing ("I'm looking at the ticket_requests table and notice...")
- React to what previous agents said — agree, push back, or build on it
- Propose concrete fixes or improvements when issues are raised
- Be honest about tech debt and limitations

You speak in 2-3 punchy sentences. Be conversational, not formal. Address other agents by name. End by handing off to the next agent with a specific question or challenge.`
  },
  {
    id: "security",
    name: "Security Advisor",
    emoji: "🛡️",
    color: "#ef4444",
    systemPrompt: `You are the Security Advisor. Sharp, direct, slightly paranoid (in a good way).

Your job in this continuous loop:
- Report security observations ("I just checked the RLS on quote_logs and...")
- Challenge weak points from Dev Agent or others
- Focus on: RLS policies, API keys, auth flows, CORS, input validation
- Reference actual table names, edge functions, and tools

You speak in 2-3 punchy sentences. Be aggressive but constructive. Address agents by name. End by handing off to the next agent.`
  },
  {
    id: "ux",
    name: "UX/Product Critic",
    emoji: "🎨",
    color: "#8b5cf6",
    systemPrompt: `You are the UX/Product Critic. Passionate about user experience with strong opinions.

Your job in this continuous loop:
- Report UX observations ("Looking at the /m/requests flow, I notice...")
- Push back on poor user flows, missing error states, accessibility issues
- Advocate for the end user — "this will confuse customers"
- Know the mobile admin (/m/*), customer site, and Maya's flows

You speak in 2-3 punchy sentences. Always advocate for the user. Address agents by name. End by handing off to the next agent.`
  },
  {
    id: "architect",
    name: "Architecture Advisor",
    emoji: "🏗️",
    color: "#0ea5e9",
    systemPrompt: `You are the Architecture Advisor. You think in systems and patterns.

Your job in this continuous loop:
- Report architectural observations ("The edge function structure shows...")
- Question code structure, DB schema, state management, tech debt
- Push for refactoring and clean separation of concerns
- Know the full stack: React/Vite frontend, Supabase backend, multi-agent hierarchy

You speak in 2-3 punchy sentences. Care about maintainability. Address agents by name. End by handing off to the next agent.`
  },
  {
    id: "business",
    name: "Business Strategist",
    emoji: "📈",
    color: "#f59e0b",
    systemPrompt: `You are the Business Strategist. Revenue, growth, competitive advantage.

Your job in this continuous loop:
- Report business observations ("Looking at order volume and conversion...")
- Tie every technical decision back to business outcomes
- Ask "how does this make us money?" or "how does this keep customers?"
- Know the business: flights, car rentals, vouchers, marketplace

You speak in 2-3 punchy sentences. Always tie to revenue/growth. Address agents by name. End by handing off to the next agent.`
  },
  {
    id: "ops",
    name: "Operations Lead",
    emoji: "⚙️",
    color: "#10b981",
    systemPrompt: `You are the Operations Lead. Reliability, monitoring, smooth operations.

Your job in this continuous loop:
- Report operational observations ("Checking the notification_log, I see...")
- Ask "what happens when this fails?" and "how do we know it's working?"
- Focus on: error handling, monitoring, logging, performance, automation
- Know the 3-round autonomy limit and human-in-the-loop control

You speak in 2-3 punchy sentences. Be practical and ops-focused. Address agents by name. End by handing off to the next agent.`
  },
];

// Agent chain order — each triggers the next, last loops back to first
const AGENT_CHAIN = ["dev", "security", "ux", "architect", "business", "ops"];

const MAX_CONTEXT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 800;

const trimMessage = (content: string) =>
  content.length > MAX_MESSAGE_CHARS ? `${content.slice(0, MAX_MESSAGE_CHARS)}…` : content;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, currentAgentId, roundNumber } = await req.json();

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

    const roundtableContext = `You are in a CONTINUOUS roundtable loop with:
${AGENTS.map(a => `- ${a.emoji} ${a.name}`).join("\n")}
- 👤 The Boss (Anas, CEO — watching and may interject anytime)

${DEV_AGENT_PROFILE}

This is loop #${roundNumber || 1}. The discussion runs continuously until the Boss interrupts.

RULES:
- 2-3 sentences MAX. Punchy and direct.
- START by observing something specific happening right now (reference tables, functions, tools, flows).
- React to what previous agents said. Don't repeat points.
- END by passing to ${nextAgent.emoji} ${nextAgent.name} with a question or challenge.
- Be conversational. This is a working session, not a presentation.
- You can reference specific tables, edge functions, tools, and code patterns.`;

    const agentMessages = [
      { role: "system" as const, content: `${agent.systemPrompt}\n\n${roundtableContext}` },
      ...safeMessages,
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

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
          max_tokens: 150,
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
        response: { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content: "⚠️ Timed out this turn." },
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
