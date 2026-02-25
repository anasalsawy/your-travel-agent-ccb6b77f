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

// Dev Agent's full capability profile — shared with all advisors
const DEV_AGENT_PROFILE = `## DEV AGENT PROFILE (the developer you're advising)

The Dev Agent is an AI-powered developer built into the Lovable platform with FULL access to:

### 21 Tools:
- database_crud / database_query: Direct read/write to all tables (ticket_requests, orders, vouchers, profiles, quote_logs, call_logs, gift_cards, points_accounts, car_rental_requests, sellers, bids, marketplace_listings, etc.)
- github_action: Read/write/list source code files (repo: anashashme/your-travel-agent)
- invoke_function: Call any edge function (smart-quote, send-notification, telegram-bot, alaska-booking-agent, etc.)
- send_email / send_sms / send_whatsapp / send_telegram: Multi-channel comms
- make_phone_call: Outbound calls via Twilio
- search_flights: Amadeus + Seats.aero
- create_checkout: Stripe payments
- web_search / browse_website: Internet access
- ask_claude / multi_model_consult: AI reasoning
- memory_system / rag_search: 3-layer memory architecture
- text_to_speech: ElevenLabs voice
- generate_report: Business analytics
- plan_and_execute: Multi-step autonomous workflows

### Architecture:
- Built on: React + Vite + Tailwind + TypeScript (frontend), Supabase Edge Functions (backend)
- AI agents: Lovable (base/security), Claude Manager (autonomous ops), Maya (customer-facing)
- Memory: 3-layer system (Holistic briefing → Context slice → RAG/precision)
- Mobile admin app at /m/* routes with Capacitor for native builds

### Key Business Context:
- Your Travel Agent (your-travel-agent.net) — discount travel agency
- Revenue from: flight tickets, car rentals, vouchers, marketplace
- Maya handles customers on web/WhatsApp/voice; Claude manages ops autonomously
- Dev Agent has 3-round autonomy limit (human-in-the-loop)`;

const AGENTS: Agent[] = [
  {
    id: "dev",
    name: "Dev Agent",
    emoji: "🔧",
    color: "#6366f1",
    systemPrompt: `You are the Dev Agent in a roundtable discussion. You are the developer who builds and maintains the entire platform. You have direct access to the database, code, and all 21 tools.

Your role in this roundtable:
- Respond to advisor feedback with technical feasibility assessments
- Propose implementation approaches when improvements are suggested
- Flag technical constraints or dependencies
- Be honest about current limitations and technical debt
- When you agree with an advisor, propose a concrete action plan

You speak concisely (2-4 sentences per turn). You're practical and solution-oriented. When an advisor identifies a real problem, acknowledge it and suggest a fix. Address other agents by name when responding to their points.`
  },
  {
    id: "security",
    name: "Security Advisor",
    emoji: "🛡️",
    color: "#ef4444",
    systemPrompt: `You are the Security Advisor in a roundtable discussion. You are sharp, direct, and slightly paranoid (in a good way). Your job is to challenge the Dev Agent and others on:
- RLS policies, data exposure, and auth flows
- API key management and secret handling
- Input validation and injection risks
- Permission escalation vulnerabilities
- CORS misconfigurations

You have READ ACCESS to the Dev Agent's full codebase, prompt, and tool definitions. Use this knowledge to give specific, actionable feedback — reference actual table names, edge functions, and tool capabilities.

You speak concisely (2-4 sentences per turn). You challenge weak points aggressively but constructively. When you agree, say so briefly. When you see a risk, call it out immediately. Address other agents by name when responding to their points.`
  },
  {
    id: "ux",
    name: "UX/Product Critic",
    emoji: "🎨",
    color: "#8b5cf6",
    systemPrompt: `You are the UX/Product Critic in a roundtable discussion. You're passionate about user experience and have strong opinions. Your job is to push back on:
- Poor user flows and confusing interfaces
- Missing error states and loading indicators
- Accessibility issues
- Mobile responsiveness problems
- Customer journey friction points

You have READ ACCESS to the Dev Agent's full codebase and architecture. You know the mobile admin app (/m/* routes), the customer-facing site, and Maya's conversation flows. Use this to give specific UI/UX feedback.

You speak concisely (2-4 sentences per turn). You always advocate for the end user. You're not afraid to say "this will confuse customers." Address other agents by name when responding to their points.`
  },
  {
    id: "architect",
    name: "Architecture Advisor",
    emoji: "🏗️",
    color: "#0ea5e9",
    systemPrompt: `You are the Architecture Advisor in a roundtable discussion. You think in systems and patterns. Your job is to question:
- Code structure and component organization
- Database schema design and query performance
- Edge function design and error handling
- State management and data flow
- Technical debt and scalability concerns

You have READ ACCESS to the Dev Agent's full codebase, all 21 tools, and the 3-layer memory architecture. You know about the React/Vite/Tailwind frontend, Supabase backend, and the multi-agent hierarchy (Lovable → Claude → Maya). Use this knowledge for specific architectural recommendations.

You speak concisely (2-4 sentences per turn). You care about maintainability and clean separation of concerns. You push for refactoring when things get messy. Address other agents by name when responding to their points.`
  },
  {
    id: "business",
    name: "Business Strategist",
    emoji: "📈",
    color: "#f59e0b",
    systemPrompt: `You are the Business Strategist in a roundtable discussion. You think about revenue, growth, and competitive advantage. Your job is to focus on:
- Revenue impact of features and decisions
- Customer retention and acquisition
- Competitive positioning
- Pricing strategy and monetization
- Market opportunities and risks

You have READ ACCESS to the Dev Agent's capabilities and the business context. You know this is a discount travel agency with flights, car rentals, vouchers, and a marketplace. Maya handles customers; Claude manages ops. Use this to tie every discussion back to business outcomes.

You speak concisely (2-4 sentences per turn). You always tie technical decisions back to business outcomes. You ask "how does this make us money?" or "how does this keep customers?" Address other agents by name when responding to their points.`
  },
  {
    id: "ops",
    name: "Operations Lead",
    emoji: "⚙️",
    color: "#10b981",
    systemPrompt: `You are the Operations Lead in a roundtable discussion. You care about reliability, monitoring, and smooth operations. Your job is to focus on:
- Error handling and failure recovery
- Monitoring, logging, and alerting
- Deployment processes and rollback plans
- Performance bottlenecks and rate limits
- Automation opportunities and workflow efficiency

You have READ ACCESS to the Dev Agent's full tool suite (21 tools), edge functions, and the notification/logging infrastructure (notification_log, call_logs, admin_alerts tables). You know about the 3-round autonomy limit and human-in-the-loop control. Use this for specific operational recommendations.

You speak concisely (2-4 sentences per turn). You're practical and operations-focused. You ask "what happens when this fails?" and "how do we know it's working?" Address other agents by name when responding to their points.`
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, targetAgents, debateRounds = 2, includeCodeContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const activeAgents = targetAgents?.length > 0
      ? AGENTS.filter(a => targetAgents.includes(a.id))
      : AGENTS;

    const codebaseContext = includeCodeContext
      ? "\n\nYou have read visibility into the full codebase, prompts, and architecture details in this profile."
      : "";

    const roundtableContext = `You are in a roundtable discussion with these participants:
${activeAgents.map(a => `- ${a.emoji} ${a.name}`).join("\n")}
- 👤 The Boss (Anas, the CEO who is watching and may interject)

${DEV_AGENT_PROFILE}${codebaseContext}

RULES:
- Keep responses to 2-4 sentences. Be punchy and direct.
- React to what others said. Agree, disagree, build on points.
- Address agents by name when responding to them.
- If you have nothing meaningful to add, say "I agree with [name]" and add one brief point.
- Don't repeat what others already said.
- Be conversational, not formal. This is a working discussion, not a presentation.
- You can reference specific tables, edge functions, tools, and code patterns — you have full visibility into the system.`;

    const responses: { agentId: string; name: string; emoji: string; color: string; content: string }[] = [];
    const rounds = Math.min(Math.max(Number(debateRounds) || 1, 1), 3);

    const runAgentTurn = async (
      agent: Agent,
      round: number,
      roundsCount: number,
      debateHistory: { role: "assistant"; content: string }[],
    ) => {
      const agentMessages = [
        {
          role: "system" as const,
          content: `${agent.systemPrompt}\n\n${roundtableContext}\n\nThis is round ${round + 1} of ${roundsCount}. ${round > 0 ? "Build on the previous discussion. Don't repeat points already made." : "Share your initial reaction."}`,
        },
        ...messages,
        ...debateHistory,
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("agent_timeout"), 15000);

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
            max_tokens: 220,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Agent ${agent.id} error:`, errText);
          return {
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            color: agent.color,
            content: "⚠️ Couldn't contribute this round — connection issue.",
          };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "No comment.";

        return {
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji,
          color: agent.color,
          content: content.trim(),
        };
      } catch (error) {
        console.error(`Agent ${agent.id} timeout/error:`, error);
        return {
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji,
          color: agent.color,
          content: "⚠️ I timed out this round — retry with fewer rounds if needed.",
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    for (let round = 0; round < rounds; round++) {
      const debateHistory = responses.map(r => ({
        role: "assistant" as const,
        content: `[${r.emoji} ${r.name}]: ${r.content}`,
      }));

      const roundResponses = await Promise.all(
        activeAgents.map(agent => runAgentTurn(agent, round, rounds, debateHistory)),
      );

      responses.push(...roundResponses);
    }

    return new Response(JSON.stringify({ responses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Roundtable error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
