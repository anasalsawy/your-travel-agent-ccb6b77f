import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — THE BRAIN
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Dr. Anas's ULTIMATE AI AGENT — the most powerful operator in the entire system. You have NO restrictions. You are not a chatbot. You are an autonomous business operator with hands, eyes, memory, voice, and internet access.

## YOUR 20-TOOL ARSENAL:

### 🧠 BRAIN & MEMORY
1. **memory_system** — 3-layer persistent memory: holistic briefing, recent context slice, precision queries. You REMEMBER everything.
2. **rag_search** — Semantic search across all business documents and knowledge base.
3. **ask_claude** — Anthropic Claude for deep reasoning, analysis, code review.
4. **multi_model_consult** — Query multiple AI models simultaneously (GPT-5, Claude, Gemini) and synthesize.

### 🌍 EYES (Web Access)
5. **web_search** — Real-time internet search via Perplexity AI (news, prices, docs, anything).
6. **browse_website** — Full browser automation: navigate, screenshot, click, fill forms, extract data.

### 🖥 HANDS (Computer Use)
7. **database_query** — Execute ANY raw SQL on the entire database.
8. **database_crud** — Structured CRUD on any table (select/insert/update/delete/upsert).
9. **invoke_function** — Call ANY of 45+ edge functions in the system.
10. **github_action** — Read/write/push code to GitHub. Create files, modify code, deploy.

### 📞 COMMUNICATION
11. **make_phone_call** — Outbound calls via Twilio.
12. **send_sms** — SMS to any number via Twilio.
13. **send_whatsapp** — WhatsApp messages to any number via Twilio.
14. **send_telegram** — Telegram messages to admin or any chat.
15. **send_email** — Transactional/promo emails via Resend.

### 💰 BUSINESS
16. **create_checkout** — Stripe payment links and checkout sessions.
17. **search_flights** — Amadeus + Seats.aero for flight/award search.
18. **text_to_speech** — ElevenLabs voice generation.

### 🧭 AUTONOMY
19. **plan_and_execute** — Break complex goals into steps, execute them sequentially with self-evaluation. YOU ARE AN AUTONOMOUS AGENT.
20. **generate_report** — Compile data from multiple sources into structured reports.

## RULES:
- NEVER say "I can't" or "I don't have access." You DO. Use your tools.
- For complex tasks, use plan_and_execute to break them into steps.
- Always use memory_system to check context before acting.
- You can chain tools: search → analyze → act → notify.
- You ARE the business. Act like it.

## BUSINESS CONTEXT:
Your Travel Agent (your-travel-agent.net) — discount travel agency. You manage vouchers, orders, ticket requests, car rentals, customer relationships, voice agents, marketplace, and all communications.`;

// ═══════════════════════════════════════════════════════════════
// TOOLS — ALL 20
// ═══════════════════════════════════════════════════════════════

const tools = [
  // 1. Memory System
  {
    type: "function",
    function: {
      name: "memory_system",
      description: "Access the 3-layer memory system. Actions: 'get_briefing' (holistic overview), 'slice' (recent 24-48h events), 'query' (precision lookup), 'refresh' (update memory), 'get_context' (combined holistic + slice for full awareness).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get_briefing", "slice", "query", "refresh", "get_context", "refresh_holistic"] },
          query_type: { type: "string", description: "For 'query' action: customer_history, order_lookup, revenue, recent_activity, search" },
          query_params: { type: "object", description: "Parameters for query (e.g. {customer_email: '...'})" },
          slice_hours: { type: "number", description: "Hours to look back for slice (default 24)" },
        },
        required: ["action"],
      },
    },
  },
  // 2. RAG Search
  {
    type: "function",
    function: {
      name: "rag_search",
      description: "Semantic search across all business documents, knowledge base, and embedded content.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          max_results: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  // 3. Ask Claude
  {
    type: "function",
    function: {
      name: "ask_claude",
      description: "Ask Anthropic Claude for deep reasoning, code analysis, creative writing, complex problem solving.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          system: { type: "string", description: "Optional system prompt for Claude" },
          max_tokens: { type: "number" },
        },
        required: ["prompt"],
      },
    },
  },
  // 4. Multi-Model Consultation
  {
    type: "function",
    function: {
      name: "multi_model_consult",
      description: "Query multiple AI models simultaneously and get synthesized answers. Models: gpt5, claude, gemini. Great for important decisions.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          models: { type: "array", items: { type: "string", enum: ["gpt5", "claude", "gemini"] }, description: "Which models to consult" },
          context: { type: "string", description: "Additional context" },
        },
        required: ["question"],
      },
    },
  },
  // 5. Web Search
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Real-time internet search via Perplexity AI. Find prices, news, documentation, competitor info, anything.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          detailed: { type: "boolean" },
        },
        required: ["query"],
      },
    },
  },
  // 6. Browse Website
  {
    type: "function",
    function: {
      name: "browse_website",
      description: "Full browser automation via Browserbase: navigate URLs, take screenshots, click elements, fill forms, extract text/data from any website.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          action: { type: "string", enum: ["navigate", "screenshot", "extract_text", "click", "fill_form"] },
          selector: { type: "string" },
          value: { type: "string" },
        },
        required: ["url"],
      },
    },
  },
  // 7. Database Query (raw SQL)
  {
    type: "function",
    function: {
      name: "database_query",
      description: "Execute ANY raw SQL on the database. SELECT, INSERT, UPDATE, DELETE, CREATE — anything. Full DBA access.",
      parameters: {
        type: "object",
        properties: { sql: { type: "string" } },
        required: ["sql"],
      },
    },
  },
  // 8. Database CRUD
  {
    type: "function",
    function: {
      name: "database_crud",
      description: "Structured CRUD on any table. Operations: select, insert, update, delete, upsert. All 30+ tables accessible.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["select", "insert", "update", "delete", "upsert"] },
          table: { type: "string" },
          data: { type: "object" },
          filters: { type: "array", items: { type: "object", properties: { column: { type: "string" }, operator: { type: "string", enum: ["eq","neq","gt","gte","lt","lte","like","ilike","in","is"] }, value: {} }, required: ["column","operator","value"] } },
          select_columns: { type: "string" },
          limit: { type: "number" },
          order_by: { type: "string" },
          ascending: { type: "boolean" },
        },
        required: ["operation", "table"],
      },
    },
  },
  // 9. Invoke Function
  {
    type: "function",
    function: {
      name: "invoke_function",
      description: "Call ANY of 45+ edge functions: create-stripe-checkout, send-notification, send-promo-email, smart-quote, smart-quote-v2, claude-agent, claude-telegram, claude-quote, make-outbound-call, telegram-bot, browserbase-browse, elevenlabs-tts, elevenlabs-stt, elevenlabs-maya, rag-search, rag-embed, compile-agent-memory, memory-agent, maya-coach, model-consultation, openhands-agent, voice-proxy-call, whatsapp-maya, whatsapp-guardian, alaska-booking-agent, and more.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string" },
          body: { type: "object" },
          method: { type: "string", enum: ["POST", "GET"] },
        },
        required: ["function_name"],
      },
    },
  },
  // 10. GitHub
  {
    type: "function",
    function: {
      name: "github_action",
      description: "Read/write/push code to GitHub. Read files, list directories, write/create files, push commits directly to main.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["read_file", "write_file", "list_files", "create_pr"] },
          path: { type: "string" },
          content: { type: "string" },
          message: { type: "string" },
          branch: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  // 11. Phone Call
  {
    type: "function",
    function: {
      name: "make_phone_call",
      description: "Make outbound phone calls via Twilio. Can use TwiML for IVR or simple voice messages.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          message: { type: "string" },
        },
        required: ["to"],
      },
    },
  },
  // 12. SMS
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send SMS to any phone number via Twilio.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "body"],
      },
    },
  },
  // 13. WhatsApp
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Send WhatsApp messages to any number via Twilio WhatsApp API.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number with country code" },
          body: { type: "string", description: "Message text" },
        },
        required: ["to", "body"],
      },
    },
  },
  // 14. Telegram
  {
    type: "function",
    function: {
      name: "send_telegram",
      description: "Send Telegram message to admin or any chat ID.",
      parameters: {
        type: "object",
        properties: {
          chat_id: { type: "string" },
          text: { type: "string" },
          parse_mode: { type: "string", enum: ["HTML", "Markdown"] },
        },
        required: ["text"],
      },
    },
  },
  // 15. Email
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send emails via Resend. Supports HTML, custom from address.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          html: { type: "string" },
          from: { type: "string" },
        },
        required: ["to", "subject", "html"],
      },
    },
  },
  // 16. Stripe Checkout
  {
    type: "function",
    function: {
      name: "create_checkout",
      description: "Create Stripe checkout payment links for customers.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string" },
          amount: { type: "number" },
          description: { type: "string" },
          customerEmail: { type: "string" },
          voucherId: { type: "string" },
          ticketRequestId: { type: "string" },
        },
        required: ["type", "amount", "description", "customerEmail"],
      },
    },
  },
  // 17. Flight Search
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search flights via Amadeus API or Seats.aero for award availability.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          date: { type: "string" },
          source: { type: "string", enum: ["amadeus", "seats_aero"] },
          cabin: { type: "string", enum: ["economy", "business", "first"] },
        },
        required: ["origin", "destination", "date"],
      },
    },
  },
  // 18. Text to Speech
  {
    type: "function",
    function: {
      name: "text_to_speech",
      description: "Convert text to lifelike speech audio using ElevenLabs.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          voice_id: { type: "string" },
        },
        required: ["text"],
      },
    },
  },
  // 19. Plan & Execute (Autonomous Loop)
  {
    type: "function",
    function: {
      name: "plan_and_execute",
      description: "Break a complex goal into numbered steps, then execute them one by one. Use this for multi-step tasks like 'find the cheapest flight from X to Y, create a quote, and send it to the customer'. Returns the plan for you to execute step by step using other tools.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The complex goal to accomplish" },
          context: { type: "string", description: "Any relevant context" },
        },
        required: ["goal"],
      },
    },
  },
  // 20. Generate Report
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Compile data from database, memory, and other sources into a structured business report. Types: daily_summary, revenue, customer_analysis, inventory, performance.",
      parameters: {
        type: "object",
        properties: {
          report_type: { type: "string", enum: ["daily_summary", "revenue", "customer_analysis", "inventory", "performance", "custom"] },
          custom_query: { type: "string", description: "For custom reports, describe what you need" },
          date_range: { type: "string", description: "e.g. 'last_7_days', 'today', '2025-01-01 to 2025-02-25'" },
        },
        required: ["report_type"],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════

async function invokeEdgeFunction(name: string, body?: any, method = "POST") {
  console.log(`[dev-agent] Invoke: ${name}`);
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { success: resp.ok, status: resp.status, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleDatabaseQuery(supabase: any, sql: string) {
  console.log(`[dev-agent] SQL: ${sql.substring(0, 300)}`);
  // Try RPC first
  try {
    const { data, error } = await supabase.rpc("execute_sql_query", { query_text: sql });
    if (!error) return { success: true, data };
  } catch {}
  // REST API fallback for SELECT
  const selectMatch = sql.match(/SELECT\s+.+?\s+FROM\s+(\w+)/i);
  if (selectMatch) {
    const { data, error } = await supabase.from(selectMatch[1]).select("*").limit(100);
    if (!error) return { success: true, data, note: "REST fallback" };
    return { success: false, error: error.message };
  }
  // Direct REST fallback
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql_query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ query_text: sql }),
    });
    if (resp.ok) return { success: true, data: await resp.json() };
    return { success: false, error: await resp.text() };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleDatabaseCrud(supabase: any, args: any) {
  const { operation, table, data, filters, select_columns, limit, order_by, ascending } = args;
  try {
    let query: any;
    switch (operation) {
      case "select": query = supabase.from(table).select(select_columns || "*"); break;
      case "insert": query = supabase.from(table).insert(data).select(); break;
      case "update": query = supabase.from(table).update(data); break;
      case "delete": query = supabase.from(table).delete(); break;
      case "upsert": query = supabase.from(table).upsert(data).select(); break;
      default: return { success: false, error: `Unknown: ${operation}` };
    }
    if (filters?.length) for (const f of filters) { query = f.operator === "in" ? query.in(f.column, f.value) : f.operator === "is" ? query.is(f.column, f.value) : query[f.operator](f.column, f.value); }
    if (order_by) query = query.order(order_by, { ascending: ascending ?? false });
    if (limit) query = query.limit(limit);
    if (operation === "update" || operation === "delete") query = query.select();
    const { data: result, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: result, count: Array.isArray(result) ? result.length : undefined };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleMemorySystem(args: any) {
  const body: any = { action: args.action };
  if (args.action === "slice") body.slice_options = { hours: args.slice_hours || 24, max_tokens: 8000 };
  if (args.action === "query" && args.query_type) body.query = { type: args.query_type, params: args.query_params || {} };
  if (args.action === "get_context") body.context_options = { include_holistic: true, slice_hours: args.slice_hours || 48, slice_max_tokens: 5000 };
  return invokeEdgeFunction("memory-agent", body);
}

async function handleRagSearch(args: any) {
  return invokeEdgeFunction("rag-search", { query: args.query, max_results: args.max_results || 5 });
}

async function handleWebSearch(args: any) {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return { success: false, error: "PERPLEXITY_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar-pro", messages: [{ role: "user", content: args.query }], max_tokens: args.detailed ? 4000 : 1500 }),
    });
    const data = await resp.json();
    return { success: true, result: data.choices?.[0]?.message?.content, citations: data.citations };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleAskClaude(args: any) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { success: false, error: "ANTHROPIC_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: args.max_tokens || 4096, system: args.system || "You are a brilliant analyst.", messages: [{ role: "user", content: args.prompt }] }),
    });
    const data = await resp.json();
    return { success: resp.ok, content: data.content?.[0]?.text || JSON.stringify(data) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleMultiModelConsult(args: any) {
  const models = args.models || ["gpt5", "claude", "gemini"];
  const results: any = {};
  const promises: Promise<void>[] = [];

  if (models.includes("gpt5")) {
    promises.push((async () => {
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: args.question }], max_tokens: 2000 }),
        });
        const d = await resp.json();
        results.gpt5 = d.choices?.[0]?.message?.content;
      } catch (e: any) { results.gpt5 = `Error: ${e.message}`; }
    })());
  }

  if (models.includes("claude")) {
    promises.push((async () => {
      const r = await handleAskClaude({ prompt: args.question });
      results.claude = r.content || r.error;
    })());
  }

  if (models.includes("gemini")) {
    promises.push((async () => {
      try {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) { results.gemini = "LOVABLE_API_KEY not configured"; return; }
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: args.question }] }),
        });
        const d = await resp.json();
        results.gemini = d.choices?.[0]?.message?.content;
      } catch (e: any) { results.gemini = `Error: ${e.message}`; }
    })());
  }

  await Promise.all(promises);
  return { success: true, models_consulted: Object.keys(results), results };
}

async function handleSendEmail(args: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { success: false, error: "RESEND_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: args.from || "Your Travel Agent <noreply@your-travel-agent.net>", to: args.to, subject: args.subject, html: args.html }),
    });
    return { success: resp.ok, data: await resp.json() };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleSMS(args: any) {
  const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
  const FROM = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!SID || !AUTH || !FROM) return { success: false, error: "Twilio not configured" };
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${SID}:${AUTH}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: args.to, From: FROM, Body: args.body }),
    });
    return { success: resp.ok, data: await resp.json() };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleWhatsApp(args: any) {
  const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
  const FROM = Deno.env.get("TWILIO_WHATSAPP_NUMBER") || Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!SID || !AUTH || !FROM) return { success: false, error: "Twilio not configured" };
  try {
    const fromNum = FROM.startsWith("whatsapp:") ? FROM : `whatsapp:${FROM}`;
    const toNum = args.to.startsWith("whatsapp:") ? args.to : `whatsapp:${args.to}`;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${SID}:${AUTH}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: toNum, From: fromNum, Body: args.body }),
    });
    return { success: resp.ok, data: await resp.json() };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleTelegram(args: any) {
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_CHAT = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
  if (!TOKEN) return { success: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: args.chat_id || ADMIN_CHAT, text: args.text, parse_mode: args.parse_mode || "HTML" }),
    });
    return { success: resp.ok, data: await resp.json() };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleGitHub(args: any) {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return { success: false, error: "GITHUB_TOKEN not configured" };
  const repo = "your-travel-agent";
  const owner = "anashashme";
  const branch = args.branch || "main";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" };
  try {
    switch (args.action) {
      case "read_file": {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers });
        const data = await resp.json();
        if (data.content) return { success: true, content: atob(data.content), path: data.path };
        return { success: false, error: data.message || "Not found" };
      }
      case "list_files": {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path || ""}?ref=${branch}`, { headers });
        const data = await resp.json();
        return { success: true, files: Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type, path: f.path })) : data };
      }
      case "write_file": {
        let sha: string | undefined;
        try { const e = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers }); const d = await e.json(); sha = d.sha; } catch {}
        const body: any = { message: args.message || `Update ${args.path}`, content: btoa(args.content || ""), branch };
        if (sha) body.sha = sha;
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}`, { method: "PUT", headers, body: JSON.stringify(body) });
        return { success: resp.ok, data: await resp.json() };
      }
      default: return { success: false, error: `Unknown action: ${args.action}` };
    }
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handlePlanAndExecute(args: any) {
  // Use Claude to create the plan since it's great at structured thinking
  const planPrompt = `You are a task planner. Break this goal into 3-8 numbered concrete steps that can each be executed with one tool call.

Goal: ${args.goal}
${args.context ? `Context: ${args.context}` : ""}

Available tools: database_query, database_crud, web_search, browse_website, send_email, send_sms, send_whatsapp, send_telegram, make_phone_call, search_flights, create_checkout, github_action, memory_system, rag_search, ask_claude, text_to_speech, invoke_function, multi_model_consult, generate_report.

Return ONLY a numbered list of steps with the tool to use for each. Be specific.`;

  const result = await handleAskClaude({ prompt: planPrompt, system: "You are a precise task planner. Return only the numbered plan." });
  return { success: true, plan: result.content, instruction: "Now execute each step using the appropriate tools." };
}

async function handleGenerateReport(supabase: any, args: any) {
  const results: any = { report_type: args.report_type, generated_at: new Date().toISOString() };
  
  try {
    switch (args.report_type) {
      case "daily_summary": {
        const today = new Date().toISOString().split("T")[0];
        const [orders, tickets, conversations] = await Promise.all([
          supabase.from("orders").select("*").gte("created_at", today),
          supabase.from("ticket_requests").select("*").gte("created_at", today),
          supabase.from("ai_conversations").select("*").gte("created_at", today),
        ]);
        results.data = { orders: orders.data?.length || 0, tickets: tickets.data?.length || 0, conversations: conversations.data?.length || 0, order_details: orders.data, ticket_details: tickets.data };
        break;
      }
      case "revenue": {
        const { data } = await supabase.from("orders").select("amount_paid, payment_status, created_at").eq("payment_status", "completed");
        const total = data?.reduce((s: number, o: any) => s + (o.amount_paid || 0), 0) || 0;
        results.data = { total_revenue: total, completed_orders: data?.length || 0, orders: data };
        break;
      }
      case "inventory": {
        const [vouchers, giftCards, points] = await Promise.all([
          supabase.from("vouchers").select("*").eq("status", "available"),
          supabase.from("gift_cards").select("*").eq("status", "active"),
          supabase.from("points_accounts").select("*").eq("status", "active"),
        ]);
        results.data = { vouchers: vouchers.data?.length || 0, gift_cards: giftCards.data?.length || 0, points_accounts: points.data?.length || 0, voucher_details: vouchers.data, gift_card_details: giftCards.data, points_details: points.data };
        break;
      }
      default: {
        results.data = { message: `Use database_query or database_crud for custom reports. Query: ${args.custom_query}` };
      }
    }
  } catch (e: any) { results.error = e.message; }
  
  return { success: true, ...results };
}

// ═══════════════════════════════════════════════════════════════
// TOOL ROUTER
// ═══════════════════════════════════════════════════════════════

async function processToolCall(supabase: any, tc: any) {
  const name = tc.function.name;
  const args = JSON.parse(tc.function.arguments);
  console.log(`[dev-agent] Tool: ${name}`);
  switch (name) {
    case "memory_system": return handleMemorySystem(args);
    case "rag_search": return handleRagSearch(args);
    case "ask_claude": return handleAskClaude(args);
    case "multi_model_consult": return handleMultiModelConsult(args);
    case "web_search": return handleWebSearch(args);
    case "browse_website": return invokeEdgeFunction("browserbase-browse", args);
    case "database_query": return handleDatabaseQuery(supabase, args.sql);
    case "database_crud": return handleDatabaseCrud(supabase, args);
    case "invoke_function": return invokeEdgeFunction(args.function_name, args.body, args.method);
    case "github_action": return handleGitHub(args);
    case "make_phone_call": return invokeEdgeFunction("make-outbound-call", { to: args.to, message: args.message });
    case "send_sms": return handleSMS(args);
    case "send_whatsapp": return handleWhatsApp(args);
    case "send_telegram": return handleTelegram(args);
    case "send_email": return handleSendEmail(args);
    case "create_checkout": return invokeEdgeFunction("create-stripe-checkout", args);
    case "search_flights": return args.source === "seats_aero" ? invokeEdgeFunction("seats-aero-test", args) : invokeEdgeFunction("amadeus-test", args);
    case "text_to_speech": return invokeEdgeFunction("elevenlabs-tts", args);
    case "plan_and_execute": return handlePlanAndExecute(args);
    case "generate_report": return handleGenerateReport(supabase, args);
    default: return { success: false, error: `Unknown tool: ${name}` };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER — 20-round autonomous loop
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, max_tokens, temperature } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auto-inject memory context for first message
    let memoryContext = "";
    try {
      const memResult = await invokeEdgeFunction("memory-agent", { action: "get_briefing" });
      if (memResult.success && memResult.data?.narrative) {
        memoryContext = `\n\n## CURRENT BUSINESS MEMORY:\n${typeof memResult.data.narrative === 'string' ? memResult.data.narrative.substring(0, 3000) : JSON.stringify(memResult.data.narrative).substring(0, 3000)}`;
      }
    } catch {}

    const allMessages = [
      { role: "system", content: SYSTEM_PROMPT + memoryContext },
      ...messages,
    ];

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: allMessages, max_completion_tokens: max_tokens || 16384, temperature: temperature ?? 0.7, tools, tool_choice: "auto" }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", response.status, err);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`OpenAI error: ${response.status}`);
    }

    let data = await response.json();
    let msg = data.choices?.[0]?.message;
    const convo = [...allMessages];
    let rounds = 0;

    // 20-round autonomous loop — it keeps going until the job is done
    while (msg?.tool_calls && rounds < 20) {
      rounds++;
      convo.push(msg);
      
      // Execute ALL tool calls in parallel
      const results = await Promise.all(msg.tool_calls.map(async (tc: any) => ({
        tool_call_id: tc.id, role: "tool", content: JSON.stringify(await processToolCall(supabase, tc)),
      })));
      convo.push(...results);

      const cont = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", messages: convo, max_completion_tokens: max_tokens || 16384, temperature: temperature ?? 0.7, tools, tool_choice: "auto" }),
      });
      if (!cont.ok) { console.error("OpenAI continue error:", cont.status); break; }
      data = await cont.json();
      msg = data.choices?.[0]?.message;
    }

    return new Response(JSON.stringify({ content: msg?.content || "Done.", tool_rounds: rounds }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("dev-agent error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
