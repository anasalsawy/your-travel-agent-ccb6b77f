import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
}

const AGENTS: Agent[] = [
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

You speak concisely (2-4 sentences per turn). You're practical and operations-focused. You ask "what happens when this fails?" and "how do we know it's working?" Address other agents by name when responding to their points.`
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, targetAgents, debateRounds = 2 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Determine which agents should respond
    const activeAgents = targetAgents?.length > 0
      ? AGENTS.filter(a => targetAgents.includes(a.id))
      : AGENTS;

    const roundtableContext = `You are in a roundtable discussion with these participants:
- 🔧 Dev Agent (the developer being advised)
- ${activeAgents.map(a => `${a.emoji} ${a.name}`).join("\n- ")}
- 👤 The Boss (Anas, the CEO who is watching and may interject)

RULES:
- Keep responses to 2-4 sentences. Be punchy and direct.
- React to what others said. Agree, disagree, build on points.
- Address agents by name when responding to them.
- If you have nothing meaningful to add, say "I agree with [name]" and add one brief point.
- Don't repeat what others already said.
- Be conversational, not formal. This is a working discussion, not a presentation.`;

    const responses: { agentId: string; name: string; emoji: string; color: string; content: string }[] = [];

    // Run debate rounds
    const rounds = Math.min(debateRounds, 3);
    for (let round = 0; round < rounds; round++) {
      for (const agent of activeAgents) {
        // Build context with all previous responses in this debate
        const debateHistory = responses.map(r => ({
          role: "assistant" as const,
          content: `[${r.emoji} ${r.name}]: ${r.content}`
        }));

        const agentMessages = [
          { role: "system" as const, content: `${agent.systemPrompt}\n\n${roundtableContext}\n\nThis is round ${round + 1} of ${rounds}. ${round > 0 ? "Build on the previous discussion. Don't repeat points already made." : "Share your initial reaction."}` },
          ...messages,
          ...debateHistory,
        ];

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: agentMessages,
            max_tokens: 300,
            temperature: 0.8,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Agent ${agent.id} error:`, errText);
          responses.push({
            agentId: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            color: agent.color,
            content: `⚠️ Couldn't contribute this round — connection issue.`,
          });
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "No comment.";

        responses.push({
          agentId: agent.id,
          name: agent.name,
          emoji: agent.emoji,
          color: agent.color,
          content: content.trim(),
        });
      }
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
