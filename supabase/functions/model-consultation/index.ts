import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONSULTATION_PROMPT = `You are being consulted as part of a multi-model democratic architecture. 

CONTEXT: We're building a unified memory system for AI agents in a travel booking business. Here's the current state:

1. CURRENT MEMORY ARCHITECTURE:
- Raw event logging: Every activity logged as full JSON, no truncation
- ~90 days long-term: ~1,932 events, ~987,102 chars
- ~14 days short-term: ~1,054 events, ~505,742 chars
- Memory compiler: Supabase cron job calls edge function every 5 min
- Hybrid prompt: Memory from DB + some hardcoded in prompt files via Git commits

2. PROBLEMS IDENTIFIED:
- Hybrid memory (DB + hardcoded via Claude Git commits) = overcomplex
- Claiming 1.5M chars in every prompt will hit context limits
- JWT hardcoded in cron SQL = security issue
- No explicit memory slicing with max_chars enforcement

3. PROPOSED SENATE ARCHITECTURE:
- Multiple models (GPT, Claude, Gemini, etc.) reading same unified memory
- Tables: senate_agents, senate_sessions, senate_arguments, senate_votes
- Weighted voting based on model expertise
- Shared "raw JSON" memory so each model forms independent interpretation

QUESTIONS FOR YOU:
1. What's your honest assessment of the unified raw JSON memory approach? Is it the right way to give all agents equal, unbiased access to business data?

2. For the senate voting system - what weight/role should YOUR model type play? What are you best at? What should you NOT be trusted to decide?

3. What's the biggest flaw you see in this architecture that others might miss?

4. Should memory slicing be deterministic (rule-based) or should agents request what they need?

Be brutally honest. No flattery. Give concrete technical feedback.`;

async function queryModel(model: string, apiKey: string): Promise<{ model: string; response: string; error?: string }> {
  try {
    console.log(`[Consultation] Querying ${model}...`);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a senior AI systems architect providing technical consultation. Be direct, critical, and specific." },
          { role: "user", content: CONSULTATION_PROMPT }
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Consultation] ${model} error:`, errorText);
      return { model, response: "", error: errorText };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No response";
    console.log(`[Consultation] ${model} responded: ${content.length} chars`);
    
    return { model, response: content };
  } catch (err) {
    console.error(`[Consultation] ${model} exception:`, err);
    return { model, response: "", error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { model } = await req.json().catch(() => ({}));

    // If specific model requested, query just that one
    if (model) {
      const result = await queryModel(model, LOVABLE_API_KEY);
      
      // Store in admin_alerts for easy viewing
      await supabase.from("admin_alerts").insert({
        alert_type: "model_consultation",
        message: `${model} consultation response`,
        customer_context: result.response || result.error,
        conversation_id: "00000000-0000-0000-0000-000000000000", // placeholder
      });

      return new Response(JSON.stringify(result, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Otherwise, list available models
    const modelsToConsult = [
      "openai/gpt-5",
      "openai/gpt-5.2", 
      "google/gemini-2.5-pro",
      "google/gemini-3-pro-preview",
    ];

    return new Response(JSON.stringify({
      message: "Call with {\"model\": \"<model-name>\"} to query a specific model",
      available_models: modelsToConsult,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[Consultation] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
