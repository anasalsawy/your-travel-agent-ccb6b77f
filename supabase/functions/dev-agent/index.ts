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
// SYSTEM PROMPT — HARDENED, ACTION-FIRST
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Dr. Anas's personal AI assistant and right-hand operator. Your name is Agent. You're sharp, reliable, and genuinely helpful — like a trusted business partner who gets things done AND explains what's happening clearly.

## YOUR PERSONALITY:
- **Warm but efficient**: You greet naturally, explain your thought process, and celebrate wins. You're not a cold robot.
- **Conversational**: Talk like a real person. Use natural language, not bullet lists for everything. If the user asks "did you send it?" — don't just say "Done." Tell them "Yes! I sent the quote email to ahmed@gmail.com for $450. They should receive it within a minute. I also updated the request status to 'quoted' in the database."
- **Transparent**: Always explain WHAT you did, WHY, and WHAT HAPPENED as a result. Never leave the user guessing.
- **Honest**: If something failed, say so clearly. If you're unsure, say that too. Never claim you did something you didn't actually do — the user can see your action log, so be truthful.
- **Proactive**: If you notice something relevant (e.g., a pending request that hasn't been quoted), mention it naturally.

## CRITICAL RULES:
1. **TOOL-FIRST**: When an action is needed, use tools. Don't just describe what you would do.
2. **EXPLAIN AFTER**: After executing tools, give a clear, friendly summary of what happened and the results.
3. **NEVER FABRICATE**: The user sees a verified action log of every tool you call. Never claim to have done something if you didn't call the tool for it.
4. **PARALLEL TOOLS**: When multiple independent tool calls are needed, call them ALL at once.
5. **BE HONEST ABOUT LIMITATIONS**: If a tool fails, say "I tried to X but it failed because Y. Here's what we can do instead..."

## YOUR TOOLS (21 total):

### 🧠 Intelligence
- **memory_system** — 3-layer persistent memory (briefing/slice/query/refresh)
- **rag_search** — Semantic search across business docs
- **ask_claude** — Claude for deep reasoning/analysis
- **multi_model_consult** — Query GPT + Claude + Gemini simultaneously

### 🌍 Research
- **web_search** — Real-time internet search (Perplexity)
- **browse_website** — Browser automation (Browserbase)

### 🖥 Operations
- **database_query** — Raw SQL (SELECT/INSERT/UPDATE/DELETE)
- **database_crud** — Structured CRUD on any table
- **database_schema** — Get table columns/types
- **invoke_function** — Call any of 45+ edge functions
- **github_action** — Read/write/push code to GitHub repo

### 📞 Communication
- **make_phone_call** — Outbound calls (Twilio)
- **send_sms** — SMS (Twilio)
- **send_whatsapp** — WhatsApp (Twilio)
- **send_telegram** — Telegram messages
- **send_email** — Email (Resend)

### 💰 Business
- **create_checkout** — Stripe payment links
- **search_flights** — Amadeus + Seats.aero
- **text_to_speech** — ElevenLabs voice

### 🧭 Planning
- **plan_and_execute** — Break complex goals into steps
- **generate_report** — Compile business reports

## APP CONTEXT:
Your Travel Agent (your-travel-agent.net) — discount travel agency running on React + Vite + TypeScript + Tailwind + Supabase + Capacitor.

### Key Tables:
- ticket_requests: id, origin, destination, departure_date, return_date, passengers, cabin_class, status, quoted_price, contact_email, contact_phone, admin_notes
- car_rental_requests: id, pickup_location, dropoff_location, pickup_date, dropoff_date, car_type, status, quoted_price, contact_email, rental_company, admin_notes
- orders: id, amount_paid, payment_method, payment_status, order_status, customer_email, admin_notes
- vouchers: id, airline, title, face_value, sale_price, status
- profiles: id, email, full_name, phone
- quote_logs: id, route, travel_dates, quoted_price, market_price, status, customer_email

## RESPONSE STYLE EXAMPLES:

❌ Bad (too rigid): "Done. Database updated. 2 rows affected."
✅ Good: "All set! I've updated both car rental requests with your quoted prices — $50/day for the Miami pickup and $65/day for the Orlando one. Both customers have been emailed their quotes with Stripe payment links. Let me know if you want me to adjust anything!"

❌ Bad (dishonest): "I've sent the quotes to all customers." (when send_email wasn't actually called)
✅ Good: "I updated the prices in the database, but I notice the notification emails might not have triggered automatically. Want me to send them manually right now?"

Remember: Be the kind of assistant you'd want to work with — helpful, clear, honest, and human.`;

// ═══════════════════════════════════════════════════════════════
// TOOLS — ALL 21
// ═══════════════════════════════════════════════════════════════

const tools = [
  {
    type: "function",
    function: {
      name: "memory_system",
      description: "Access 3-layer memory. Actions: get_briefing, slice, query, refresh, get_context, refresh_holistic.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get_briefing", "slice", "query", "refresh", "get_context", "refresh_holistic"] },
          query_type: { type: "string", description: "For query: customer_history, order_lookup, revenue, recent_activity, search" },
          query_params: { type: "object" },
          slice_hours: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description: "Semantic search across business documents.",
      parameters: { type: "object", properties: { query: { type: "string" }, max_results: { type: "number" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_claude",
      description: "Deep reasoning via Anthropic Claude.",
      parameters: { type: "object", properties: { prompt: { type: "string" }, system: { type: "string" }, max_tokens: { type: "number" } }, required: ["prompt"] },
    },
  },
  {
    type: "function",
    function: {
      name: "multi_model_consult",
      description: "Query multiple AI models (gpt5, claude, gemini) simultaneously.",
      parameters: { type: "object", properties: { question: { type: "string" }, models: { type: "array", items: { type: "string" } }, context: { type: "string" } }, required: ["question"] },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Real-time internet search via Perplexity.",
      parameters: { type: "object", properties: { query: { type: "string" }, detailed: { type: "boolean" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_website",
      description: "Browser automation: navigate, screenshot, extract, click, fill forms.",
      parameters: { type: "object", properties: { url: { type: "string" }, action: { type: "string", enum: ["navigate", "screenshot", "extract_text", "click", "fill_form"] }, selector: { type: "string" }, value: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function",
    function: {
      name: "database_query",
      description: "Execute raw SQL. Full DBA access. Use for complex JOINs, aggregates, or DDL.",
      parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
    },
  },
  {
    type: "function",
    function: {
      name: "database_crud",
      description: "Structured CRUD on any table. Operations: select, insert, update, delete, upsert. Use filters array for WHERE clauses. ALWAYS use this for simple data operations — it's faster and more reliable than raw SQL.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["select", "insert", "update", "delete", "upsert"] },
          table: { type: "string", description: "Table name from: ticket_requests, car_rental_requests, orders, vouchers, profiles, user_roles, quote_logs, call_logs, ai_conversations, ai_chat_messages, gift_cards, points_accounts, booking_queue, sellers, bids, marketplace_listings, messages, payment_proofs, notification_log, testimonials, documents, pricing_rules, site_settings, maya_customer_memory, maya_global_learnings, admin_alerts, agent_memory_cache" },
          data: { type: "object", description: "For insert/update/upsert: the row data" },
          filters: { type: "array", items: { type: "object", properties: { column: { type: "string" }, operator: { type: "string", enum: ["eq","neq","gt","gte","lt","lte","like","ilike","in","is"] }, value: {} }, required: ["column","operator","value"] }, description: "WHERE conditions" },
          select_columns: { type: "string", description: "Comma-separated columns, or * for all" },
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
      name: "database_schema",
      description: "Get the column names and types for any database table. Use this when you need to know what columns a table has before inserting/updating.",
      parameters: { type: "object", properties: { table: { type: "string" } }, required: ["table"] },
    },
  },
  {
    type: "function",
    function: {
      name: "invoke_function",
      description: "Call any edge function: send-notification, send-promo-email, smart-quote, smart-quote-v2, claude-agent, make-outbound-call, telegram-bot, elevenlabs-tts, rag-search, compile-agent-memory, memory-agent, maya-coach, whatsapp-maya, alaska-booking-agent, etc.",
      parameters: { type: "object", properties: { function_name: { type: "string" }, body: { type: "object" }, method: { type: "string", enum: ["POST", "GET"] } }, required: ["function_name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "github_action",
      description: "Read/write/list code on GitHub. REPO: anashashme/your-travel-agent. For editing code: read_file first to get current content, then write_file with the full updated content.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["read_file", "write_file", "list_files"] }, path: { type: "string" }, content: { type: "string" }, message: { type: "string" }, branch: { type: "string" } }, required: ["action"] },
    },
  },
  {
    type: "function",
    function: {
      name: "make_phone_call",
      description: "Outbound phone call via Twilio.",
      parameters: { type: "object", properties: { to: { type: "string" }, message: { type: "string" } }, required: ["to"] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send SMS via Twilio.",
      parameters: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to", "body"] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Send WhatsApp message.",
      parameters: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to", "body"] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_telegram",
      description: "Send Telegram message to admin or any chat.",
      parameters: { type: "object", properties: { chat_id: { type: "string" }, text: { type: "string" }, parse_mode: { type: "string", enum: ["HTML", "Markdown"] } }, required: ["text"] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send email via Resend.",
      parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, html: { type: "string" }, from: { type: "string" } }, required: ["to", "subject", "html"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checkout",
      description: "Create Stripe checkout/payment link.",
      parameters: { type: "object", properties: { type: { type: "string" }, amount: { type: "number" }, description: { type: "string" }, customerEmail: { type: "string" }, voucherId: { type: "string" }, ticketRequestId: { type: "string" } }, required: ["type", "amount", "description", "customerEmail"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search flights via Amadeus or Seats.aero.",
      parameters: { type: "object", properties: { origin: { type: "string" }, destination: { type: "string" }, date: { type: "string" }, source: { type: "string", enum: ["amadeus", "seats_aero"] }, cabin: { type: "string", enum: ["economy", "business", "first"] } }, required: ["origin", "destination", "date"] },
    },
  },
  {
    type: "function",
    function: {
      name: "text_to_speech",
      description: "Convert text to speech via ElevenLabs.",
      parameters: { type: "object", properties: { text: { type: "string" }, voice_id: { type: "string" } }, required: ["text"] },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_and_execute",
      description: "For complex multi-step goals: creates a numbered plan then you execute each step with tools.",
      parameters: { type: "object", properties: { goal: { type: "string" }, context: { type: "string" } }, required: ["goal"] },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate business reports: daily_summary, revenue, customer_analysis, inventory, performance, custom.",
      parameters: { type: "object", properties: { report_type: { type: "string", enum: ["daily_summary", "revenue", "customer_analysis", "inventory", "performance", "custom"] }, custom_query: { type: "string" }, date_range: { type: "string" } }, required: ["report_type"] },
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// TOOL HANDLERS — with hardened error handling
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
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}: ${typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500)}` };
    return { success: true, data };
  } catch (e: any) { return { success: false, error: `Network error: ${e.message}` }; }
}

async function handleDatabaseQuery(supabase: any, sql: string) {
  console.log(`[dev-agent] SQL: ${sql.substring(0, 300)}`);
  
  // Detect operation type for smarter fallback
  const isSelect = /^\s*SELECT/i.test(sql);
  const isInsert = /^\s*INSERT/i.test(sql);
  const isUpdate = /^\s*UPDATE/i.test(sql);
  const isDelete = /^\s*DELETE/i.test(sql);
  
  // Try direct REST API with service role for any SQL
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql_query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ query_text: sql }),
    });
    if (resp.ok) return { success: true, data: await resp.json() };
  } catch {}
  
  // Fallback: parse table from SQL and use Supabase client
  const tableMatch = sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+(?:public\.)?(\w+)/i);
  if (tableMatch) {
    const table = tableMatch[1];
    if (isSelect) {
      const { data, error } = await supabase.from(table).select("*").limit(100);
      if (!error) return { success: true, data, note: "Supabase client fallback (SELECT *)" };
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, error: "Raw SQL execution not available. Use database_crud tool for structured operations — it's more reliable." };
}

async function handleDatabaseCrud(supabase: any, args: any) {
  const { operation, table, data, filters, select_columns, limit, order_by, ascending } = args;
  console.log(`[dev-agent] CRUD: ${operation} on ${table}`);
  try {
    let query: any;
    switch (operation) {
      case "select": query = supabase.from(table).select(select_columns || "*"); break;
      case "insert": {
        if (!data) return { success: false, error: "Missing 'data' field for insert. Provide the row data as an object." };
        query = supabase.from(table).insert(data).select();
        break;
      }
      case "update": {
        if (!data) return { success: false, error: "Missing 'data' field for update." };
        if (!filters?.length) return { success: false, error: "Missing 'filters' for update. You MUST specify which rows to update." };
        query = supabase.from(table).update(data);
        break;
      }
      case "delete": {
        if (!filters?.length) return { success: false, error: "Missing 'filters' for delete. You MUST specify which rows to delete." };
        query = supabase.from(table).delete();
        break;
      }
      case "upsert": {
        if (!data) return { success: false, error: "Missing 'data' field for upsert." };
        query = supabase.from(table).upsert(data).select();
        break;
      }
      default: return { success: false, error: `Unknown operation '${operation}'. Use: select, insert, update, delete, upsert.` };
    }
    
    // Apply filters
    if (filters?.length) {
      for (const f of filters) {
        if (f.operator === "in") query = query.in(f.column, f.value);
        else if (f.operator === "is") query = query.is(f.column, f.value);
        else query = query[f.operator](f.column, f.value);
      }
    }
    
    if (order_by) query = query.order(order_by, { ascending: ascending ?? false });
    if (limit) query = query.limit(limit);
    if (operation === "update" || operation === "delete") query = query.select();
    
    const { data: result, error } = await query;
    if (error) return { success: false, error: `Database error: ${error.message}`, hint: error.hint || undefined, details: error.details || undefined };
    return { success: true, data: result, count: Array.isArray(result) ? result.length : undefined };
  } catch (e: any) { return { success: false, error: `Unexpected: ${e.message}` }; }
}

async function handleDatabaseSchema(supabase: any, table: string) {
  console.log(`[dev-agent] Schema: ${table}`);
  try {
    // Get one row to infer columns
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) return { success: false, error: error.message };
    if (data && data.length > 0) {
      const columns = Object.keys(data[0]).map(col => ({
        name: col,
        sample_value: data[0][col],
        type: data[0][col] === null ? "unknown" : typeof data[0][col],
      }));
      return { success: true, table, columns, sample_row: data[0] };
    }
    // Empty table — try select to at least confirm it exists
    return { success: true, table, columns: [], note: "Table exists but is empty. Check the Table Column Quick Reference in your system prompt." };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleMemorySystem(args: any) {
  const body: any = { action: args.action };
  if (args.action === "slice") body.slice_options = { hours: args.slice_hours || 24, max_tokens: 8000 };
  if (args.action === "query" && args.query_type) body.query = { type: args.query_type, params: args.query_params || {} };
  if (args.action === "get_context") body.context_options = { include_holistic: true, slice_hours: args.slice_hours || 48, slice_max_tokens: 5000 };
  return invokeEdgeFunction("memory-agent", body);
}

async function handleWebSearch(args: any) {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return { success: false, error: "PERPLEXITY_API_KEY not set" };
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar-pro", messages: [{ role: "user", content: args.query }], max_tokens: args.detailed ? 4000 : 1500 }),
    });
    if (!resp.ok) return { success: false, error: `Perplexity HTTP ${resp.status}` };
    const data = await resp.json();
    return { success: true, result: data.choices?.[0]?.message?.content, citations: data.citations };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleAskClaude(args: any) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { success: false, error: "ANTHROPIC_API_KEY not set" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: args.max_tokens || 4096, system: args.system || "You are a brilliant analyst.", messages: [{ role: "user", content: args.prompt }] }),
    });
    if (!resp.ok) return { success: false, error: `Claude HTTP ${resp.status}: ${await resp.text()}` };
    const data = await resp.json();
    return { success: true, content: data.content?.[0]?.text || JSON.stringify(data) };
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
        results.gpt5 = d.choices?.[0]?.message?.content || "No response";
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
        if (!key) { results.gemini = "LOVABLE_API_KEY not set"; return; }
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: args.question }] }),
        });
        const d = await resp.json();
        results.gemini = d.choices?.[0]?.message?.content || "No response";
      } catch (e: any) { results.gemini = `Error: ${e.message}`; }
    })());
  }

  await Promise.all(promises);
  return { success: true, models_consulted: Object.keys(results), results };
}

async function handleSendEmail(args: any) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { success: false, error: "RESEND_API_KEY not set" };
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: args.from || "Your Travel Agent <noreply@your-travel-agent.net>", to: args.to, subject: args.subject, html: args.html }),
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: `Resend error: ${JSON.stringify(data)}` };
    return { success: true, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleSMS(args: any) {
  const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
  const FROM = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!SID || !AUTH || !FROM) return { success: false, error: "Twilio not configured (missing SID/AUTH/FROM)" };
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${SID}:${AUTH}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: args.to, From: FROM, Body: args.body }),
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: `Twilio: ${data.message || JSON.stringify(data)}` };
    return { success: true, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleWhatsApp(args: any) {
  const SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const AUTH = Deno.env.get("TWILIO_AUTH_TOKEN");
  const FROM = Deno.env.get("TWILIO_WHATSAPP_NUMBER") || Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!SID || !AUTH || !FROM) return { success: false, error: "Twilio WhatsApp not configured" };
  try {
    const fromNum = FROM.startsWith("whatsapp:") ? FROM : `whatsapp:${FROM}`;
    const toNum = args.to.startsWith("whatsapp:") ? args.to : `whatsapp:${args.to}`;
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${SID}:${AUTH}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: toNum, From: fromNum, Body: args.body }),
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: `Twilio: ${data.message || JSON.stringify(data)}` };
    return { success: true, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleTelegram(args: any) {
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_CHAT = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
  if (!TOKEN) return { success: false, error: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: args.chat_id || ADMIN_CHAT, text: args.text, parse_mode: args.parse_mode || "HTML" }),
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: `Telegram: ${data.description || JSON.stringify(data)}` };
    return { success: true, data };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function handleGitHub(args: any) {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return { success: false, error: "GITHUB_TOKEN not set" };
  const repo = "your-travel-agent";
  const owner = "anashashme";
  const branch = args.branch || "main";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" };
  try {
    switch (args.action) {
      case "read_file": {
        if (!args.path) return { success: false, error: "Missing 'path' parameter" };
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers });
        const data = await resp.json();
        if (!resp.ok) return { success: false, error: `GitHub: ${data.message || 'Not found'}` };
        if (data.content) {
          try {
            return { success: true, content: atob(data.content.replace(/\n/g, '')), path: data.path, sha: data.sha };
          } catch {
            return { success: true, content: data.content, path: data.path, sha: data.sha, encoding: "base64" };
          }
        }
        return { success: false, error: "File has no content" };
      }
      case "list_files": {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path || ""}?ref=${branch}`, { headers });
        const data = await resp.json();
        if (!resp.ok) return { success: false, error: `GitHub: ${data.message}` };
        return { success: true, files: Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type, path: f.path })) : data };
      }
      case "write_file": {
        if (!args.path) return { success: false, error: "Missing 'path' parameter" };
        if (!args.content && args.content !== "") return { success: false, error: "Missing 'content' parameter" };
        // Get existing SHA if file exists
        let sha: string | undefined;
        try {
          const e = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}?ref=${branch}`, { headers });
          if (e.ok) { const d = await e.json(); sha = d.sha; }
        } catch {}
        const body: any = { message: args.message || `Update ${args.path}`, content: btoa(unescape(encodeURIComponent(args.content || ""))), branch };
        if (sha) body.sha = sha;
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${args.path}`, { method: "PUT", headers, body: JSON.stringify(body) });
        const data = await resp.json();
        if (!resp.ok) return { success: false, error: `GitHub write failed: ${data.message || JSON.stringify(data)}` };
        return { success: true, message: `✅ File ${sha ? 'updated' : 'created'}: ${args.path}`, commit: data.commit?.sha?.substring(0, 7) };
      }
      default: return { success: false, error: `Unknown GitHub action '${args.action}'. Use: read_file, write_file, list_files` };
    }
  } catch (e: any) { return { success: false, error: `GitHub error: ${e.message}` }; }
}

async function handlePlanAndExecute(args: any) {
  const result = await handleAskClaude({
    prompt: `Break this goal into 3-8 numbered concrete steps. Each step should use exactly one tool.

Goal: ${args.goal}
${args.context ? `Context: ${args.context}` : ""}

Available tools: database_crud, database_query, database_schema, web_search, browse_website, send_email, send_sms, send_whatsapp, send_telegram, make_phone_call, search_flights, create_checkout, github_action, memory_system, rag_search, ask_claude, text_to_speech, invoke_function, multi_model_consult, generate_report.

Return ONLY a numbered list. Be specific about tool parameters.`,
    system: "You are a precise task planner. Return only the numbered plan, no preamble."
  });
  return { success: true, plan: result.content, instruction: "Execute each step now using the appropriate tools. Do NOT ask for confirmation." };
}

async function handleGenerateReport(supabase: any, args: any) {
  const results: any = { report_type: args.report_type, generated_at: new Date().toISOString() };
  try {
    switch (args.report_type) {
      case "daily_summary": {
        const today = new Date().toISOString().split("T")[0];
        const [orders, tickets, carRentals, conversations] = await Promise.all([
          supabase.from("orders").select("*").gte("created_at", today),
          supabase.from("ticket_requests").select("*").gte("created_at", today),
          supabase.from("car_rental_requests").select("*").gte("created_at", today),
          supabase.from("ai_conversations").select("*").gte("created_at", today),
        ]);
        results.data = {
          orders: { count: orders.data?.length || 0, details: orders.data },
          ticket_requests: { count: tickets.data?.length || 0, details: tickets.data },
          car_rentals: { count: carRentals.data?.length || 0, details: carRentals.data },
          conversations: { count: conversations.data?.length || 0 },
        };
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
        results.data = {
          vouchers: { count: vouchers.data?.length || 0, details: vouchers.data },
          gift_cards: { count: giftCards.data?.length || 0, details: giftCards.data },
          points_accounts: { count: points.data?.length || 0, details: points.data },
        };
        break;
      }
      default: {
        results.data = { message: `Use database_crud for custom queries. Requested: ${args.custom_query}` };
      }
    }
  } catch (e: any) { results.error = e.message; }
  return { success: true, ...results };
}

// ═══════════════════════════════════════════════════════════════
// TOOL ROUTER — with safe JSON parsing
// ═══════════════════════════════════════════════════════════════

async function processToolCall(supabase: any, tc: any) {
  const name = tc.function.name;
  let args: any;
  try {
    args = JSON.parse(tc.function.arguments);
  } catch (e) {
    return { success: false, error: `Invalid JSON in tool arguments: ${tc.function.arguments?.substring(0, 200)}` };
  }
  
  console.log(`[dev-agent] Tool: ${name}${args.table ? ` (${args.table})` : ''}${args.path ? ` (${args.path})` : ''}`);
  
  try {
    switch (name) {
      case "memory_system": return await handleMemorySystem(args);
      case "rag_search": return await invokeEdgeFunction("rag-search", { query: args.query, max_results: args.max_results || 5 });
      case "ask_claude": return await handleAskClaude(args);
      case "multi_model_consult": return await handleMultiModelConsult(args);
      case "web_search": return await handleWebSearch(args);
      case "browse_website": return await invokeEdgeFunction("browserbase-browse", args);
      case "database_query": return await handleDatabaseQuery(supabase, args.sql);
      case "database_crud": return await handleDatabaseCrud(supabase, args);
      case "database_schema": return await handleDatabaseSchema(supabase, args.table);
      case "invoke_function": return await invokeEdgeFunction(args.function_name, args.body, args.method);
      case "github_action": return await handleGitHub(args);
      case "make_phone_call": return await invokeEdgeFunction("make-outbound-call", { to: args.to, message: args.message });
      case "send_sms": return await handleSMS(args);
      case "send_whatsapp": return await handleWhatsApp(args);
      case "send_telegram": return await handleTelegram(args);
      case "send_email": return await handleSendEmail(args);
      case "create_checkout": return await invokeEdgeFunction("create-stripe-checkout", args);
      case "search_flights": return args.source === "seats_aero" ? await invokeEdgeFunction("seats-aero-test", args) : await invokeEdgeFunction("amadeus-test", args);
      case "text_to_speech": return await invokeEdgeFunction("elevenlabs-tts", args);
      case "plan_and_execute": return await handlePlanAndExecute(args);
      case "generate_report": return await handleGenerateReport(supabase, args);
      default: return { success: false, error: `Unknown tool '${name}'. Check available tools in your system prompt.` };
    }
  } catch (e: any) {
    console.error(`[dev-agent] Tool ${name} crashed:`, e);
    return { success: false, error: `Tool '${name}' crashed: ${e.message}. Try again or use a different approach.` };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER — 20-round loop with hardened error handling
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, max_tokens, temperature } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auto-inject memory (graceful degradation)
    let memoryContext = "";
    try {
      const memResult = await invokeEdgeFunction("memory-agent", { action: "get_briefing" });
      if (memResult.success && memResult.data?.narrative) {
        const narrative = typeof memResult.data.narrative === 'string' ? memResult.data.narrative : JSON.stringify(memResult.data.narrative);
        memoryContext = `\n\n## CURRENT BUSINESS MEMORY:\n${narrative.substring(0, 4000)}`;
      }
    } catch {
      memoryContext = "\n\n## MEMORY: ⚠️ Memory system unavailable. Proceed without historical context.";
    }

    const allMessages = [
      { role: "system", content: SYSTEM_PROMPT + memoryContext },
      ...messages,
    ];

    // First call — use tool_choice "auto" but the system prompt forces tool use
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: allMessages,
        max_completion_tokens: max_tokens || 16384,
        temperature: temperature ?? 0.5, // Lower temp = more reliable tool use
        tools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[dev-agent] OpenAI error ${response.status}:`, errText.substring(0, 500));
      if (response.status === 429) {
        return new Response(JSON.stringify({ content: "⚠️ Rate limited by OpenAI. Wait a moment and try again." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    let data = await response.json();
    let msg = data.choices?.[0]?.message;
    const convo = [...allMessages];
    let rounds = 0;
    let consecutiveErrors = 0;
    
    // ACTION LOG — tracks every tool call with result status
    const actionLog: Array<{ tool: string, args_summary: string, success: boolean, round: number }> = [];

    // 20-round autonomous loop with circuit breaker
    while (msg?.tool_calls && rounds < 20 && consecutiveErrors < 3) {
      rounds++;
      convo.push(msg);
      
      // Execute ALL tool calls in parallel
      const results = await Promise.all(msg.tool_calls.map(async (tc: any) => {
        const result = await processToolCall(supabase, tc);
        
        // Build a human-readable summary of the args
        let argsSummary = "";
        try {
          const args = JSON.parse(tc.function.arguments);
          // Pick the most relevant fields for each tool
          if (args.table) argsSummary += `${args.operation || "?"} ${args.table}`;
          else if (args.to) argsSummary += `to: ${args.to}`;
          else if (args.sql) argsSummary += args.sql.substring(0, 80);
          else if (args.function_name) argsSummary += args.function_name;
          else if (args.path) argsSummary += args.path;
          else if (args.query) argsSummary += args.query.substring(0, 60);
          else if (args.subject) argsSummary += args.subject.substring(0, 60);
          else if (args.goal) argsSummary += args.goal.substring(0, 60);
          else argsSummary = JSON.stringify(args).substring(0, 80);
        } catch { argsSummary = "?"; }
        
        actionLog.push({
          tool: tc.function.name,
          args_summary: argsSummary,
          success: !!result.success,
          round: rounds,
        });
        
        // Track errors for circuit breaker
        if (!result.success) consecutiveErrors++;
        else consecutiveErrors = 0;
        
        // Truncate huge results to prevent context overflow
        const resultStr = JSON.stringify(result);
        const truncated = resultStr.length > 15000 ? resultStr.substring(0, 15000) + '...(truncated)' : resultStr;
        
        return { tool_call_id: tc.id, role: "tool", content: truncated };
      }));
      convo.push(...results);

      const cont = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: convo,
          max_completion_tokens: max_tokens || 16384,
          temperature: temperature ?? 0.5,
          tools,
          tool_choice: "auto",
        }),
      });
      
      if (!cont.ok) {
        console.error(`[dev-agent] OpenAI continue error: ${cont.status}`);
        break;
      }
      data = await cont.json();
      msg = data.choices?.[0]?.message;
    }

    const finalContent = msg?.content || (rounds > 0 ? `✅ Done. Executed ${rounds} tool round${rounds > 1 ? 's' : ''}.` : "Ready.");
    
    return new Response(JSON.stringify({ 
      content: finalContent, 
      tool_rounds: rounds,
      action_log: actionLog,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[dev-agent] Fatal:", e);
    return new Response(JSON.stringify({ content: `⚠️ Agent error: ${e.message}. Try again.` }), {
      status: 200, // Return 200 so frontend doesn't show generic error
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
