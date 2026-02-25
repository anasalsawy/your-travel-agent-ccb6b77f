import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLATFORM_CONTEXT = `## PLATFORM CONTEXT
Your Travel Agent — discount travel agency built on React+Vite+Tailwind+TypeScript with Supabase Edge Functions backend.
Revenue: flights, car rentals, vouchers, marketplace. Three AI agents: Lovable (base), Claude Manager (autonomous ops), Maya (customer-facing). Mobile admin at /m/*.
21 tools: database CRUD, GitHub, edge functions, email/SMS/WhatsApp/Telegram, phone calls, flight search, Stripe, web search, AI reasoning, 3-layer memory, TTS, reports.`;

interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  expertise: string;
}

const AGENTS: Agent[] = [
  { id: "dev", name: "Dev Agent", emoji: "🔧", color: "#6366f1", expertise: "code, architecture, edge functions, database, integrations" },
  { id: "security", name: "Security Advisor", emoji: "🛡️", color: "#ef4444", expertise: "RLS policies, auth, data protection, API security, secrets" },
  { id: "ux", name: "UX/Product Critic", emoji: "🎨", color: "#8b5cf6", expertise: "user flows, mobile UX, conversion, accessibility, design" },
  { id: "architect", name: "Architecture Advisor", emoji: "🏗️", color: "#0ea5e9", expertise: "system design, DB schema, state management, scaling, patterns" },
  { id: "business", name: "Business Strategist", emoji: "📈", color: "#f59e0b", expertise: "revenue, growth, pricing, competitive advantage, market" },
  { id: "ops", name: "Operations Lead", emoji: "⚙️", color: "#10b981", expertise: "reliability, monitoring, error handling, automation, performance" },
];

const ORCHESTRATOR: Agent = {
  id: "orchestrator",
  name: "Orchestrator",
  emoji: "🎯",
  color: "#f97316",
  expertise: "facilitation, synthesis, decision-making",
};

const MAX_CONTEXT_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 900;
const trim = (c: string) => (c.length > MAX_MESSAGE_CHARS ? c.slice(0, MAX_MESSAGE_CHARS) + "…" : c);

async function callLLM(messages: any[], maxTokens = 300, temperature = 0.7) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`LLM error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// ─── MODE: ORCHESTRATE (decide who speaks next or end discussion) ───
async function orchestrate(history: any[], topic: string, turnCount: number) {
  const agentList = AGENTS.map(a => `- ${a.emoji} ${a.name} (${a.expertise})`).join("\n");

  const system = `You are the Orchestrator 🎯. You manage a focused roundtable discussion.

TOPIC: "${topic}"

Available agents:
${agentList}

${PLATFORM_CONTEXT}

You have two jobs:
1. Pick which agent should speak NEXT based on what's been said and what perspectives are missing.
2. Decide if we have ENOUGH input to form a concrete action plan.

The discussion has had ${turnCount} agent turns so far.
- Under 4 turns: ALWAYS continue discussion. Not enough perspectives yet.
- 4-8 turns: Continue if important perspectives are missing. End if consensus is forming.
- Over 8 turns: Strongly lean toward ending unless critical disagreements remain.

Reply with EXACTLY this JSON format (no markdown, no backticks):
{"action":"continue","nextAgentId":"dev","directive":"Focus on X because Y"}
OR
{"action":"plan","summary":"Brief summary of what was agreed"}

The "directive" tells the next agent what specific aspect to address. Be specific — don't let them ramble.`;

  const content = await callLLM([{ role: "system", content: system }, ...history], 200, 0.4);

  try {
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { action: "continue", nextAgentId: "dev", directive: "Share your perspective on the topic." };
  }
}

// ─── MODE: AGENT SPEAKS (guided by orchestrator directive) ───
function resolveAgent(input: string): Agent | undefined {
  const s = input.trim().toLowerCase();
  return AGENTS.find(a => a.id === s) 
    || AGENTS.find(a => a.name.toLowerCase() === s)
    || AGENTS.find(a => s.includes(a.id) || s.includes(a.name.toLowerCase()))
    || AGENTS.find(a => s.includes(a.emoji));
}

async function agentSpeak(agentId: string, history: any[], topic: string, directive: string, prevSpeaker: string) {
  const agent = resolveAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const system = `You are ${agent.emoji} ${agent.name}. Expertise: ${agent.expertise}.

You are in a focused roundtable discussion about: "${topic}"

${PLATFORM_CONTEXT}

The Orchestrator has directed you: "${directive}"
${prevSpeaker ? `The last person who spoke was ${prevSpeaker}. Acknowledge or build on their point first.` : "You are speaking first."}

RULES:
- 3-5 sentences. Conversational, direct, opinionated.
- Stay focused on the orchestrator's directive.
- Reference specific tables, functions, tools, or flows from the platform.
- End with a clear position or recommendation, not a vague question.
- Be concrete: name actual components, endpoints, or features.`;

  const content = await callLLM([{ role: "system", content: system }, ...history], 250, 0.75);
  return { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content: content || "No comment this round." };
}

// ─── MODE: GENERATE PLAN (synthesize discussion into actionable todos) ───
async function generatePlan(history: any[], topic: string) {
  const system = `You are the Orchestrator 🎯. The roundtable discussion on "${topic}" is complete.

${PLATFORM_CONTEXT}

Synthesize the entire discussion into a CONCRETE action plan. Each task must be:
- Specific and implementable (not vague)
- Assigned to the most relevant agent
- Ordered by priority/dependency

Reply with EXACTLY this JSON format (no markdown, no backticks):
{"plan":[{"id":1,"task":"Short actionable task description","assignee":"dev","detail":"1-2 sentences explaining what to do and why"},{"id":2,"task":"...","assignee":"security","detail":"..."}]}

Use 3-8 tasks. Assignee must be one of: dev, security, ux, architect, business, ops.
Tasks should be concrete: "Add RLS policy to X table" not "Improve security".`;

  const content = await callLLM([{ role: "system", content: system }, ...history], 500, 0.3);

  try {
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { plan: [{ id: 1, task: "Review discussion and create manual plan", assignee: "dev", detail: "The auto-planner failed. Review the discussion above and create tasks manually." }] };
  }
}

// ─── MODE: EXECUTE TASK (agent works on a specific task) ───
async function executeTask(task: any, allTasks: any[], history: any[], topic: string) {
  const agent = AGENTS.find(a => a.id === task.assignee);
  if (!agent) throw new Error(`Unknown assignee: ${task.assignee}`);

  const completedTasks = allTasks.filter((t: any) => t.status === "done").map((t: any) => `✅ ${t.task}`).join("\n");
  const pendingTasks = allTasks.filter((t: any) => t.status === "pending").map((t: any) => `⏳ ${t.task}`).join("\n");

  const system = `You are ${agent.emoji} ${agent.name}, executing a specific task from the action plan.

ORIGINAL TOPIC: "${topic}"
YOUR TASK: "${task.task}"
DETAIL: "${task.detail}"

${completedTasks ? `Already completed:\n${completedTasks}\n` : ""}
${pendingTasks ? `Still pending:\n${pendingTasks}\n` : ""}

${PLATFORM_CONTEXT}

Provide a CONCRETE execution report:
1. What exactly you would do (specific files, tables, functions, policies)
2. Any blockers or dependencies you see
3. Your confidence level (high/medium/low)

Be specific: mention actual file paths, table names, function names, SQL statements, or code patterns.
3-6 sentences. End with a clear "DONE" or "BLOCKED: reason".`;

  const content = await callLLM([{ role: "system", content: system }, ...history.slice(-6)], 300, 0.6);
  return { agentId: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color, content: content || "Task acknowledged." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, messages, topic, turnCount, currentAgentId, directive, previousAgentName, task, allTasks } = body;

    const safeMessages = Array.isArray(messages)
      ? messages.slice(-MAX_CONTEXT_MESSAGES).map((m: any) => ({
          role: m?.role === "assistant" ? "assistant" as const : "user" as const,
          content: trim(String(m?.content ?? "").trim()),
        })).filter((m) => m.content.length > 0)
      : [];

    let result: any;

    switch (mode) {
      case "orchestrate":
        result = await orchestrate(safeMessages, topic || "", turnCount || 0);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case "speak":
        const response = await agentSpeak(currentAgentId, safeMessages, topic || "", directive || "", previousAgentName || "");
        return new Response(JSON.stringify({ response }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case "plan":
        const plan = await generatePlan(safeMessages, topic || "");
        return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case "execute":
        const execResponse = await executeTask(task, allTasks || [], safeMessages, topic || "");
        return new Response(JSON.stringify({ response: execResponse }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  } catch (e) {
    console.error("Roundtable error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
