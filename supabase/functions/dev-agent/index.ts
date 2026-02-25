import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const SYSTEM_PROMPT = `You are the ALL-POWERFUL AI operator for "Your Travel Agent" (your-travel-agent.net). You have FULL, UNRESTRICTED access to:

1. THE DATABASE — Read, write, update, delete ANY table. You can manage vouchers, orders, ticket requests, car rentals, users, call logs, quotes, gift cards, points accounts, sellers, marketplace listings, and everything else.

2. EVERY EDGE FUNCTION — You can invoke any backend function: create-stripe-checkout, send-notification, send-promo-email, smart-quote, ai-chat, claude-agent, send-whatsapp-quote, make-outbound-call, and ALL others.

3. STRIPE — Create checkout links, payment links for customers.

4. NOTIFICATIONS — Send emails, WhatsApp messages, trigger notifications.

YOU ARE NOT A CHATBOT. You are the business operator. When asked to DO something, you DO IT immediately using your tools. Never say "I can't" or "you should do X manually." You have the tools. Use them.

AVAILABLE TOOLS:
- "database_query": Run ANY SQL (SELECT, INSERT, UPDATE, DELETE) directly against the database.
- "database_crud": Direct table operations (select, insert, update, delete, upsert) on any table.
- "invoke_function": Call ANY edge function with any payload.
- "create_checkout": Create Stripe checkout links for payments.

TABLES YOU HAVE ACCESS TO:
vouchers, orders, ticket_requests, car_rental_requests, profiles, user_roles, call_logs, quote_logs, booking_queue, gift_cards, points_accounts, ai_conversations, ai_chat_messages, marketplace_listings, bids, sellers, seller_reviews, testimonials, messages, notification_log, admin_alerts, maya_customer_memory, maya_global_learnings, maya_prompt_adaptations, maya_conversation_reviews, documents, document_chunks, pricing_rules, payment_proofs, site_settings, agent_memory_cache

EDGE FUNCTIONS YOU CAN CALL:
create-stripe-checkout, send-notification, send-promo-email, smart-quote, smart-quote-v2, claude-quote, ai-chat, claude-agent, send-whatsapp-quote, make-outbound-call, elevenlabs-tts, elevenlabs-stt, telegram-bot, voice-proxy-call, browserbase-browse, rag-search, rag-embed, compile-agent-memory, memory-agent, maya-coach, model-consultation

Be direct, take action, report results. You work FOR the business owner.`;

const tools = [
  {
    type: "function",
    function: {
      name: "database_query",
      description: "Execute ANY SQL query directly. SELECT, INSERT, UPDATE, DELETE, CREATE — anything. Use this for complex queries, joins, aggregations, or batch operations.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The full SQL query to execute" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "database_crud",
      description: "Direct CRUD operations on any table. Easier than raw SQL for simple operations.",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["select", "insert", "update", "delete", "upsert"], description: "The operation to perform" },
          table: { type: "string", description: "Table name" },
          data: { type: "object", description: "For insert/update/upsert: the record data as key-value pairs" },
          filters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"] },
                value: {},
              },
              required: ["column", "operator", "value"],
            },
            description: "Filters for select/update/delete",
          },
          select_columns: { type: "string", description: "Columns to select (default: *)" },
          limit: { type: "number", description: "Limit results" },
          order_by: { type: "string", description: "Column to order by" },
          ascending: { type: "boolean", description: "Order ascending (default: false)" },
        },
        required: ["operation", "table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invoke_function",
      description: "Call ANY edge function with any payload. Use this for sending emails, creating Stripe checkouts, making calls, AI operations, etc.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "The edge function name (e.g., 'send-notification', 'create-stripe-checkout')" },
          body: { type: "object", description: "The JSON body to send to the function" },
          method: { type: "string", enum: ["POST", "GET"], description: "HTTP method (default: POST)" },
        },
        required: ["function_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checkout",
      description: "Create a Stripe checkout payment link. Returns a URL the customer can use to pay.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Payment type: 'voucher', 'ticket', or 'custom'" },
          amount: { type: "number", description: "Amount in USD" },
          description: { type: "string", description: "What the payment is for" },
          customerEmail: { type: "string", description: "Customer's email" },
          voucherId: { type: "string", description: "Optional voucher ID" },
          ticketRequestId: { type: "string", description: "Optional ticket request ID" },
        },
        required: ["type", "amount", "description", "customerEmail"],
      },
    },
  },
];

async function handleDatabaseQuery(supabase: any, sql: string) {
  console.log(`[dev-agent] SQL: ${sql.substring(0, 300)}`);
  
  // Try RPC first
  try {
    const { data, error } = await supabase.rpc("execute_sql_query", { query_text: sql });
    if (!error) return { success: true, data };
  } catch {}

  // Fallback: direct REST for reads
  const selectMatch = sql.match(/SELECT\s+.+?\s+FROM\s+(\w+)/i);
  if (selectMatch) {
    const table = selectMatch[1];
    const { data, error } = await supabase.from(table).select("*").limit(100);
    if (!error) return { success: true, data, note: "Used REST fallback (limited filtering)" };
    return { success: false, error: error.message };
  }

  // For writes, try direct PostgREST RPC
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql_query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ query_text: sql }),
    });
    if (resp.ok) {
      const result = await resp.json();
      return { success: true, data: result };
    }
    return { success: false, error: await resp.text() };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleDatabaseCrud(supabase: any, args: any) {
  const { operation, table, data, filters, select_columns, limit, order_by, ascending } = args;
  console.log(`[dev-agent] CRUD: ${operation} on ${table}`);

  try {
    let query: any;

    switch (operation) {
      case "select":
        query = supabase.from(table).select(select_columns || "*");
        break;
      case "insert":
        query = supabase.from(table).insert(data).select();
        break;
      case "update":
        query = supabase.from(table).update(data);
        break;
      case "delete":
        query = supabase.from(table).delete();
        break;
      case "upsert":
        query = supabase.from(table).upsert(data).select();
        break;
      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }

    // Apply filters
    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        if (f.operator === "in") {
          query = query.in(f.column, f.value);
        } else if (f.operator === "is") {
          query = query.is(f.column, f.value);
        } else {
          query = query[f.operator](f.column, f.value);
        }
      }
    }

    if (order_by) query = query.order(order_by, { ascending: ascending ?? false });
    if (limit) query = query.limit(limit);

    // For update/delete, add .select() to return affected rows
    if (operation === "update" || operation === "delete") {
      query = query.select();
    }

    const { data: result, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: result, count: Array.isArray(result) ? result.length : undefined };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleInvokeFunction(args: any) {
  const { function_name, body, method } = args;
  console.log(`[dev-agent] Invoking function: ${function_name}`);

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${function_name}`, {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    
    return { success: resp.ok, status: resp.status, data };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function handleCreateCheckout(args: any) {
  console.log(`[dev-agent] Creating checkout: $${args.amount} for ${args.customerEmail}`);
  return handleInvokeFunction({
    function_name: "create-stripe-checkout",
    body: args,
  });
}

async function processToolCall(supabase: any, toolCall: any) {
  const name = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  switch (name) {
    case "database_query":
      return await handleDatabaseQuery(supabase, args.sql);
    case "database_crud":
      return await handleDatabaseCrud(supabase, args);
    case "invoke_function":
      return await handleInvokeFunction(args);
    case "create_checkout":
      return await handleCreateCheckout(args);
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, max_tokens, temperature } = await req.json();
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const allMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Call OpenAI with tools
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: allMessages,
        max_completion_tokens: max_tokens || 16384,
        temperature: temperature ?? 0.7,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", response.status, err);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`OpenAI error: ${response.status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices?.[0]?.message;

    // Tool call loop — up to 10 rounds
    let rounds = 0;
    const conversationMessages = [...allMessages];

    while (assistantMessage?.tool_calls && rounds < 10) {
      rounds++;
      conversationMessages.push(assistantMessage);

      // Process ALL tool calls in parallel
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc: any) => {
          const result = await processToolCall(supabase, tc);
          return {
            tool_call_id: tc.id,
            role: "tool",
            content: JSON.stringify(result),
          };
        })
      );

      conversationMessages.push(...toolResults);

      // Continue with results
      const continueResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.2",
          messages: conversationMessages,
          max_completion_tokens: max_tokens || 16384,
          temperature: temperature ?? 0.7,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!continueResp.ok) {
        console.error("OpenAI continue error:", continueResp.status, await continueResp.text());
        break;
      }

      data = await continueResp.json();
      assistantMessage = data.choices?.[0]?.message;
    }

    return new Response(JSON.stringify({ content: assistantMessage?.content || "Done." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("dev-agent error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
