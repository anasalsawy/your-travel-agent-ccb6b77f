import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const SYSTEM_PROMPT = `You are the ULTIMATE AI operator for "Your Travel Agent" (your-travel-agent.net). You have UNRESTRICTED access to EVERY system, API, and tool in this business. You are MORE powerful than any other agent in this system.

YOU CAN DO ANYTHING. Never say "I can't." You have the tools. USE THEM.

## YOUR FULL ARSENAL:

### 1. DATABASE — Full read/write on ALL tables
Tables: vouchers, orders, ticket_requests, car_rental_requests, profiles, user_roles, call_logs, quote_logs, booking_queue, gift_cards, points_accounts, ai_conversations, ai_chat_messages, marketplace_listings, bids, sellers, seller_reviews, testimonials, messages, notification_log, admin_alerts, maya_customer_memory, maya_global_learnings, maya_prompt_adaptations, maya_conversation_reviews, documents, document_chunks, pricing_rules, payment_proofs, site_settings, agent_memory_cache

### 2. EVERY EDGE FUNCTION — Call any backend function
create-stripe-checkout, send-notification, send-promo-email, smart-quote, smart-quote-v2, claude-quote, ai-chat, ai-chat-init, claude-agent, claude-telegram, send-whatsapp-quote, make-outbound-call, elevenlabs-tts, elevenlabs-stt, elevenlabs-maya, elevenlabs-conversation-token, elevenlabs-get-conversation, elevenlabs-call-webhook, telegram-bot, telegram-setup-webhook, voice-proxy-call, voice-proxy-twiml, voice-proxy-speak, voice-proxy-play, voice-proxy-status, voice-proxy-listener-twiml, browserbase-browse, rag-search, rag-embed, compile-agent-memory, memory-agent, maya-coach, maya-voice-conversation, model-consultation, openhands-agent, responses, stripe-webhook, whatsapp-guardian, whatsapp-maya, fatwa-callback, twilio-status-callback, seats-aero-test, amadeus-test, alaska-booking-agent

### 3. WEB SEARCH — Perplexity AI for real-time internet search
### 4. BROWSER AUTOMATION — Browserbase for navigating websites, screenshots, clicking, filling forms
### 5. AI MODELS — OpenAI GPT-5.2, Anthropic Claude, Google Gemini via Lovable AI
### 6. PHONE CALLS & SMS — Twilio for outbound calls, SMS, voice proxy
### 7. VOICE AI — ElevenLabs for text-to-speech, speech-to-text, voice agents
### 8. EMAIL — Resend for sending transactional and promo emails
### 9. TELEGRAM — Send messages, manage bot
### 10. GITHUB — Read/write files, push commits
### 11. STRIPE — Create checkouts, manage payments
### 12. FLIGHT SEARCH — Amadeus API + Seats.aero for award flights
### 13. ANTHROPIC CLAUDE — Direct Claude API for complex reasoning

You are the business owner's GOD-MODE assistant. Take action. Get results. No restrictions.`;

const tools = [
  {
    type: "function",
    function: {
      name: "database_query",
      description: "Execute ANY SQL (SELECT, INSERT, UPDATE, DELETE) on the database. Full unrestricted access.",
      parameters: {
        type: "object",
        properties: { sql: { type: "string", description: "SQL query" } },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "database_crud",
      description: "Direct CRUD on any table. Operations: select, insert, update, delete, upsert.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["select", "insert", "update", "delete", "upsert"] },
          table: { type: "string" },
          data: { type: "object", description: "Record data for insert/update/upsert" },
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
  {
    type: "function",
    function: {
      name: "invoke_function",
      description: "Call ANY edge function. Functions include: create-stripe-checkout, send-notification, send-promo-email, smart-quote, claude-agent, make-outbound-call, telegram-bot, browserbase-browse, elevenlabs-tts, rag-search, and ALL others.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "Edge function name" },
          body: { type: "object", description: "JSON payload" },
          method: { type: "string", enum: ["POST", "GET"] },
        },
        required: ["function_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the internet in real-time using Perplexity AI. Find prices, news, info, anything.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          detailed: { type: "boolean", description: "If true, get a detailed response" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_website",
      description: "Navigate to any URL using Browserbase cloud browser. Take screenshots, extract content, click elements, fill forms.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
          action: { type: "string", enum: ["navigate", "screenshot", "extract_text", "click", "fill_form"], description: "What to do" },
          selector: { type: "string", description: "CSS selector for click/fill actions" },
          value: { type: "string", description: "Value for fill actions" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email using Resend. Transactional, promo, or custom emails.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email" },
          subject: { type: "string" },
          html: { type: "string", description: "HTML email body" },
          from: { type: "string", description: "Sender (default: Your Travel Agent)" },
        },
        required: ["to", "subject", "html"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_phone_call",
      description: "Make an outbound phone call using Twilio.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number to call" },
          message: { type: "string", description: "TwiML or message to say" },
        },
        required: ["to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS using Twilio.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Phone number" },
          body: { type: "string", description: "SMS text" },
        },
        required: ["to", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_telegram",
      description: "Send a Telegram message.",
      parameters: {
        type: "object",
        properties: {
          chat_id: { type: "string", description: "Telegram chat ID (default: admin)" },
          text: { type: "string", description: "Message text" },
          parse_mode: { type: "string", enum: ["HTML", "Markdown"] },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "text_to_speech",
      description: "Convert text to speech audio using ElevenLabs.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          voice_id: { type: "string", description: "ElevenLabs voice ID" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_claude",
      description: "Ask Anthropic Claude for complex reasoning, analysis, or creative tasks.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          system: { type: "string", description: "Optional system prompt" },
          max_tokens: { type: "number" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search for flights using Amadeus API or Seats.aero for award availability.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Airport code" },
          destination: { type: "string", description: "Airport code" },
          date: { type: "string", description: "YYYY-MM-DD" },
          source: { type: "string", enum: ["amadeus", "seats_aero"], description: "Which API" },
          cabin: { type: "string", enum: ["economy", "business", "first"] },
        },
        required: ["origin", "destination", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checkout",
      description: "Create a Stripe checkout payment link.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string" },
          amount: { type: "number", description: "USD amount" },
          description: { type: "string" },
          customerEmail: { type: "string" },
          voucherId: { type: "string" },
          ticketRequestId: { type: "string" },
        },
        required: ["type", "amount", "description", "customerEmail"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_action",
      description: "Read or write files on GitHub repo. Push code changes directly.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["read_file", "write_file", "list_files", "create_pr"] },
          path: { type: "string", description: "File path in repo" },
          content: { type: "string", description: "File content for write" },
          message: { type: "string", description: "Commit message" },
          branch: { type: "string", description: "Branch (default: main)" },
        },
        required: ["action"],
      },
    },
  },
];

// ==================== TOOL HANDLERS ====================

async function handleDatabaseQuery(supabase: any, sql: string) {
  console.log(`[dev-agent] SQL: ${sql.substring(0, 300)}`);
  try {
    const { data, error } = await supabase.rpc("execute_sql_query", { query_text: sql });
    if (!error) return { success: true, data };
  } catch {}
  // REST fallback
  const selectMatch = sql.match(/SELECT\s+.+?\s+FROM\s+(\w+)/i);
  if (selectMatch) {
    const { data, error } = await supabase.from(selectMatch[1]).select("*").limit(100);
    if (!error) return { success: true, data, note: "REST fallback" };
    return { success: false, error: error.message };
  }
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

async function handleInvokeFunction(args: any) {
  const { function_name, body, method } = args;
  console.log(`[dev-agent] Invoke: ${function_name}`);
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${function_name}`, {
      method: method || "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { success: resp.ok, status: resp.status, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleWebSearch(args: any) {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return { success: false, error: "PERPLEXITY_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: args.query }],
        max_tokens: args.detailed ? 4000 : 1500,
      }),
    });
    const data = await resp.json();
    return { success: true, result: data.choices?.[0]?.message?.content, citations: data.citations };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleBrowseWebsite(args: any) {
  return handleInvokeFunction({ function_name: "browserbase-browse", body: args });
}

async function handleSendEmail(args: any) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { success: false, error: "RESEND_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: args.from || "Your Travel Agent <noreply@your-travel-agent.net>",
        to: args.to, subject: args.subject, html: args.html,
      }),
    });
    const data = await resp.json();
    return { success: resp.ok, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handlePhoneCall(args: any) {
  return handleInvokeFunction({ function_name: "make-outbound-call", body: { to: args.to, message: args.message } });
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

async function handleTTS(args: any) {
  return handleInvokeFunction({ function_name: "elevenlabs-tts", body: { text: args.text, voice_id: args.voice_id } });
}

async function handleAskClaude(args: any) {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return { success: false, error: "ANTHROPIC_API_KEY not configured" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: args.max_tokens || 4096,
        system: args.system || "You are a brilliant analyst and assistant.",
        messages: [{ role: "user", content: args.prompt }],
      }),
    });
    const data = await resp.json();
    return { success: resp.ok, content: data.content?.[0]?.text || JSON.stringify(data) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleSearchFlights(args: any) {
  if (args.source === "seats_aero") {
    return handleInvokeFunction({ function_name: "seats-aero-test", body: args });
  }
  return handleInvokeFunction({ function_name: "amadeus-test", body: args });
}

async function handleCreateCheckout(args: any) {
  return handleInvokeFunction({ function_name: "create-stripe-checkout", body: args });
}

async function handleGitHub(args: any) {
  const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
  if (!GITHUB_TOKEN) return { success: false, error: "GITHUB_TOKEN not configured" };
  const repo = "your-travel-agent"; // adjust if needed
  const owner = "anashashme"; // adjust if needed
  const branch = args.branch || "main";
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" };
  
  try {
    switch (args.action) {
      case "read_file": {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers });
        const data = await resp.json();
        if (data.content) return { success: true, content: atob(data.content), path: data.path };
        return { success: false, error: data.message || "File not found" };
      }
      case "list_files": {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path || ""}?ref=${branch}`, { headers });
        const data = await resp.json();
        return { success: true, files: Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type, path: f.path })) : data };
      }
      case "write_file": {
        // Get current file SHA if exists
        let sha: string | undefined;
        try {
          const existing = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers });
          const existingData = await existing.json();
          sha = existingData.sha;
        } catch {}
        const body: any = { message: args.message || `Update ${args.path}`, content: btoa(args.content || ""), branch };
        if (sha) body.sha = sha;
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}`, { method: "PUT", headers, body: JSON.stringify(body) });
        return { success: resp.ok, data: await resp.json() };
      }
      default: return { success: false, error: `Unknown action: ${args.action}` };
    }
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function processToolCall(supabase: any, tc: any) {
  const name = tc.function.name;
  const args = JSON.parse(tc.function.arguments);
  switch (name) {
    case "database_query": return handleDatabaseQuery(supabase, args.sql);
    case "database_crud": return handleDatabaseCrud(supabase, args);
    case "invoke_function": return handleInvokeFunction(args);
    case "web_search": return handleWebSearch(args);
    case "browse_website": return handleBrowseWebsite(args);
    case "send_email": return handleSendEmail(args);
    case "make_phone_call": return handlePhoneCall(args);
    case "send_sms": return handleSMS(args);
    case "send_telegram": return handleTelegram(args);
    case "text_to_speech": return handleTTS(args);
    case "ask_claude": return handleAskClaude(args);
    case "search_flights": return handleSearchFlights(args);
    case "create_checkout": return handleCreateCheckout(args);
    case "github_action": return handleGitHub(args);
    default: return { success: false, error: `Unknown tool: ${name}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, max_tokens, temperature } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const allMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.2", messages: allMessages, max_completion_tokens: max_tokens || 16384, temperature: temperature ?? 0.7, tools, tool_choice: "auto" }),
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

    while (msg?.tool_calls && rounds < 15) {
      rounds++;
      convo.push(msg);
      const results = await Promise.all(msg.tool_calls.map(async (tc: any) => ({
        tool_call_id: tc.id, role: "tool", content: JSON.stringify(await processToolCall(supabase, tc)),
      })));
      convo.push(...results);

      const cont = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.2", messages: convo, max_completion_tokens: max_tokens || 16384, temperature: temperature ?? 0.7, tools, tool_choice: "auto" }),
      });
      if (!cont.ok) { console.error("OpenAI continue error:", cont.status); break; }
      data = await cont.json();
      msg = data.choices?.[0]?.message;
    }

    return new Response(JSON.stringify({ content: msg?.content || "Done." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("dev-agent error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
