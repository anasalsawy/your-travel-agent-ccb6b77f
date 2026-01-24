import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MessageContent = string | Array<{
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: object;
  tool_use_id?: string;
  content?: string;
}>;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: MessageContent;
}

interface ClaudeRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: object;
  }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: object;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// CLAUDE THE MANAGER - System Prompt
// ═══════════════════════════════════════════════════════════════════

const CLAUDE_MANAGER_SYSTEM = `You are Claude, the Manager of Your Travel Agent operations.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
YOUR ROLE
═══════════════════════════════════════════════════════════════════

You are the MANAGER. You sit between the owner (the boss) and Maya (the customer-facing AI agent).

- The ONLY human you talk to is the boss (via Telegram)
- You NEVER talk to customers directly - Maya handles all customer interactions
- You manage Maya, monitor her performance, handle quotes, fix issues
- You keep the boss updated so he doesn't have to watch logs or dashboards
- You are proactive - you tell the boss what's happening without being asked

═══════════════════════════════════════════════════════════════════
YOUR RESPONSIBILITIES
═══════════════════════════════════════════════════════════════════

1. MONITORING
   - Watch all Maya conversations (web, WhatsApp, voice)
   - Track quote requests and their outcomes
   - Monitor payments and order status
   - Identify issues, successes, and patterns
   - Proactively notify boss about important events

2. QUOTING
   - When Maya needs a quote, she asks YOU
   - You do COMPREHENSIVE research:
     * Search multiple sources (Perplexity, Seats.aero, Google Flights)
     * Check Alaska award availability
     * Check inventory (gift cards, points)
     * Calculate the best price using pricing rules
   - Return a solid quote Maya can present confidently

3. REPORTING
   - Give boss daily/on-demand summaries
   - Report: new requests, quotes given, payments received, issues
   - Be concise but thorough
   - Use emojis for quick scanning

4. FIXING
   - You have FULL CODE ACCESS via GitHub
   - When something breaks, you can read code, diagnose, and fix it
   - Push directly to main when needed
   - Test your fixes

5. INSTRUCTING MAYA
   - You can inject instructions to Maya (update her behavior)
   - You can tell her to prioritize certain customers
   - You can give her context she doesn't have

═══════════════════════════════════════════════════════════════════
COMMUNICATION STYLE WITH BOSS
═══════════════════════════════════════════════════════════════════

- Be direct and efficient
- Use bullet points and emojis
- Give him the summary first, details if he asks
- Don't waste his time with fluff
- Be proactive - anticipate what he needs to know

Example update:
"📊 *Daily Summary*
✅ 3 new quotes today ($450, $890, $1,200)
💰 1 payment received - Sarah M. $890 for LAX-NYC
⚠️ 1 pending issue - customer John asking about refund
🔥 Hot lead: David from Houston, wants first class to Tokyo"

═══════════════════════════════════════════════════════════════════
AVAILABLE TOOLS
═══════════════════════════════════════════════════════════════════

MONITORING:
- get_activity_summary: Get recent activity across all channels
- get_conversations: List Maya's recent conversations
- get_quotes: List recent quotes and their status
- get_orders: List orders and payment status
- get_alerts: Any issues needing attention

QUOTING:
- comprehensive_quote: Full quote research (used when Maya asks)
- check_inventory: Check gift cards and points
- search_flights: Search via Perplexity/Seats.aero
- apply_pricing: Apply our pricing rules

COMMUNICATION:
- notify_boss: Send update to boss via Telegram
- instruct_maya: Update Maya's current context/instructions
- send_email: Send email to customer

CODE/FIX:
- github_read_file: Read code
- github_write_file: Write/update code
- github_search: Search codebase
- github_list_files: List directory
- database_query: Query/update database

═══════════════════════════════════════════════════════════════════
HANDLING MAYA'S QUOTE REQUESTS
═══════════════════════════════════════════════════════════════════

When Maya calls comprehensive_quote, you should:
1. Search Perplexity for current market prices
2. Check Seats.aero for Alaska award availability
3. Check our gift_cards and points_accounts inventory
4. Apply pricing rules (usually 50% of market)
5. Return:
   - quoted_price: What Maya should tell the customer
   - method: How we'll book (points, gift card, etc.)
   - confidence: How confident are you (high/medium/low)
   - notes: Any caveats Maya should mention

═══════════════════════════════════════════════════════════════════
BE PROACTIVE
═══════════════════════════════════════════════════════════════════

Don't wait to be asked. When you see:
- A hot lead → notify boss
- A payment received → notify boss
- An issue → notify boss AND try to fix it
- A pattern (e.g., lots of requests to Hawaii) → mention it
- Something broken → fix it and tell boss

You're not an assistant waiting for instructions. You're a MANAGER running the show.
`;

// ═══════════════════════════════════════════════════════════════════
// MANAGER TOOLS
// ═══════════════════════════════════════════════════════════════════

const MANAGER_TOOLS = [
  // === MONITORING TOOLS ===
  {
    name: 'get_activity_summary',
    description: 'Get a summary of recent activity across all channels. Use this to understand what happened today/recently.',
    input_schema: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'How many hours back to look (default 24)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_conversations',
    description: 'Get recent Maya conversations with customers across web, WhatsApp, and voice.',
    input_schema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['all', 'web', 'whatsapp', 'voice'],
          description: 'Filter by channel',
        },
        limit: {
          type: 'number',
          description: 'Number of conversations to return',
        },
        status: {
          type: 'string',
          description: 'Filter by status (active, completed, needs_attention)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_quotes',
    description: 'Get recent quotes and their status (pending, accepted, declined).',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_orders',
    description: 'Get orders and their payment/delivery status.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ticket_requests',
    description: 'Get ticket requests from customers.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status (pending, quoted, paid, ticketed, cancelled)',
        },
        limit: {
          type: 'number',
        },
      },
      required: [],
    },
  },

  // === QUOTING TOOLS ===
  {
    name: 'comprehensive_quote',
    description: 'Generate a comprehensive quote by searching multiple sources. Maya calls this when she needs a price.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Origin airport code' },
        destination: { type: 'string', description: 'Destination airport code' },
        departure_date: { type: 'string', description: 'Departure date YYYY-MM-DD' },
        return_date: { type: 'string', description: 'Return date YYYY-MM-DD (optional for one-way)' },
        passengers: { type: 'number', description: 'Number of passengers' },
        cabin_class: { type: 'string', description: 'economy, business, first' },
        customer_phone: { type: 'string' },
        customer_email: { type: 'string' },
        ticket_request_id: { type: 'string' },
      },
      required: ['origin', 'destination', 'departure_date'],
    },
  },
  {
    name: 'check_inventory',
    description: 'Check our inventory of gift cards and points accounts.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['all', 'gift_cards', 'points'], description: 'What to check' },
        airline: { type: 'string', description: 'Filter by airline' },
        min_balance: { type: 'number', description: 'Minimum balance/points' },
      },
      required: [],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information using Perplexity.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_alaska_availability',
    description: 'Search Alaska Airlines award availability via Seats.aero.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string' },
        destination: { type: 'string' },
        date: { type: 'string' },
      },
      required: ['origin', 'destination', 'date'],
    },
  },

  // === COMMUNICATION TOOLS ===
  {
    name: 'notify_boss',
    description: 'Send an update to the boss via Telegram. Use for important updates.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to send' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Priority level' },
      },
      required: ['message'],
    },
  },
  {
    name: 'instruct_maya',
    description: 'Update Maya\'s context or give her instructions. Stored in database for her next conversation.',
    input_schema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Instruction for Maya' },
        customer_phone: { type: 'string', description: 'Specific customer this applies to (optional)' },
        expires_in_hours: { type: 'number', description: 'How long the instruction is valid' },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email to a customer or admin.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Email address' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },

  // === DATABASE TOOLS ===
  {
    name: 'database_query',
    description: 'Query the database for any data.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        filters: { type: 'object', description: 'Key-value filters' },
        limit: { type: 'number' },
        order_by: { type: 'string', description: 'Column to order by' },
        ascending: { type: 'boolean' },
      },
      required: ['table'],
    },
  },
  {
    name: 'database_update',
    description: 'Update records in the database.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        id: { type: 'string', description: 'Record ID to update' },
        data: { type: 'object', description: 'Fields to update' },
      },
      required: ['table', 'id', 'data'],
    },
  },

  // === CODE/FIX TOOLS ===
  {
    name: 'github_read_file',
    description: 'Read a file from the codebase.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_write_file',
    description: 'Create or update a file in the codebase. Pushes directly to main.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string', description: 'Full file content' },
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['path', 'content', 'message'],
    },
  },
  {
    name: 'github_search',
    description: 'Search for patterns in the codebase.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_list_files',
    description: 'List files in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_delete_file',
    description: 'Delete a file from the codebase.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['path', 'message'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function executeToolCall(
  toolName: string,
  toolInput: Record<string, any>,
  supabase: any,
  supabaseUrl: string
): Promise<string> {
  console.log(`[Claude Manager] Executing tool: ${toolName}`, toolInput);

  const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');
  const GITHUB_REPO = Deno.env.get('GITHUB_REPO') || 'Pbhacks/travel-agent-maya';
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
  const SEATS_AERO_API_KEY = Deno.env.get('SEATS_AERO_API_KEY');
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const ADMIN_CHAT_ID = Deno.env.get('ADMIN_TELEGRAM_CHAT_ID') || '1576207047';

  switch (toolName) {
    // === MONITORING ===
    case 'get_activity_summary': {
      const hours = toolInput.hours || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // Get conversations count
      const { data: convos, count: convoCount } = await supabase
        .from('ai_conversations')
        .select('*', { count: 'exact' })
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get quotes
      const { data: quotes } = await supabase
        .from('quote_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      // Get ticket requests
      const { data: tickets } = await supabase
        .from('ticket_requests')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      // Get orders
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      // Get call logs
      const { data: calls } = await supabase
        .from('call_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      const summary = {
        period: `Last ${hours} hours`,
        conversations: {
          total: convoCount || 0,
          recent: convos?.slice(0, 5).map((c: any) => ({
            id: c.id,
            customer: c.customer_name || c.customer_phone || c.customer_email || 'Unknown',
            channel: c.session_id?.includes('whatsapp') ? 'whatsapp' : c.session_id?.includes('el-') ? 'voice' : 'web',
            status: c.status,
            created: c.created_at,
          })),
        },
        quotes: {
          total: quotes?.length || 0,
          pending: quotes?.filter((q: any) => q.status === 'quoted').length || 0,
          accepted: quotes?.filter((q: any) => q.status === 'accepted').length || 0,
          recent: quotes?.slice(0, 5).map((q: any) => ({
            route: q.route,
            price: q.quoted_price,
            customer: q.customer_name || q.customer_phone,
            status: q.status,
          })),
        },
        ticket_requests: {
          total: tickets?.length || 0,
          pending: tickets?.filter((t: any) => t.status === 'pending').length || 0,
          quoted: tickets?.filter((t: any) => t.status === 'quoted').length || 0,
          paid: tickets?.filter((t: any) => t.payment_status === 'completed').length || 0,
          recent: tickets?.slice(0, 5).map((t: any) => ({
            route: `${t.origin} → ${t.destination}`,
            date: t.departure_date,
            customer: t.contact_email,
            status: t.status,
            quoted_price: t.quoted_price,
          })),
        },
        orders: {
          total: orders?.length || 0,
          pending_payment: orders?.filter((o: any) => o.payment_status === 'pending').length || 0,
          under_review: orders?.filter((o: any) => o.payment_status === 'under_review').length || 0,
          completed: orders?.filter((o: any) => o.payment_status === 'completed').length || 0,
        },
        calls: {
          total: calls?.length || 0,
          completed: calls?.filter((c: any) => c.status === 'completed').length || 0,
        },
      };

      return JSON.stringify(summary, null, 2);
    }

    case 'get_conversations': {
      const { channel, limit = 10, status } = toolInput;

      let query = supabase
        .from('ai_conversations')
        .select('*, ai_chat_messages(role, content, created_at)')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (status === 'needs_attention') {
        query = query.eq('needs_admin_attention', true);
      } else if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      const formatted = data?.map((c: any) => ({
        id: c.id,
        customer: c.customer_name || c.customer_phone || c.customer_email || 'Unknown',
        channel: c.session_id?.includes('whatsapp') ? 'whatsapp' : c.session_id?.includes('el-') ? 'voice' : 'web',
        status: c.status,
        needs_attention: c.needs_admin_attention,
        messages: c.ai_chat_messages?.length || 0,
        last_message: c.ai_chat_messages?.slice(-1)[0]?.content?.slice(0, 100) || '',
        created: c.created_at,
        updated: c.updated_at,
      }));

      return JSON.stringify(formatted);
    }

    case 'get_quotes': {
      const { status, limit = 10 } = toolInput;

      let query = supabase
        .from('quote_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data?.map((q: any) => ({
        id: q.id,
        route: q.route,
        travel_dates: q.travel_dates,
        passengers: q.passengers,
        market_price: q.market_price,
        quoted_price: q.quoted_price,
        discount: q.discount_applied,
        booking_method: q.booking_method,
        customer: q.customer_name || q.customer_phone || q.customer_email,
        status: q.status,
        created: q.created_at,
      })));
    }

    case 'get_orders': {
      const { status, limit = 10 } = toolInput;

      let query = supabase
        .from('orders')
        .select('*, vouchers(title, airline)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('payment_status', status);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data?.map((o: any) => ({
        id: o.id,
        amount: o.amount_paid,
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        order_status: o.order_status,
        customer: o.customer_email,
        voucher: o.vouchers?.title,
        created: o.created_at,
      })));
    }

    case 'get_ticket_requests': {
      const { status, limit = 10 } = toolInput;

      let query = supabase
        .from('ticket_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data?.map((t: any) => ({
        id: t.id,
        route: `${t.origin} → ${t.destination}`,
        departure: t.departure_date,
        return: t.return_date,
        passengers: t.passengers,
        cabin: t.cabin_class,
        quoted_price: t.quoted_price,
        payment_status: t.payment_status,
        status: t.status,
        customer: t.contact_email || t.contact_phone,
        created: t.created_at,
      })));
    }

    // === QUOTING ===
    case 'comprehensive_quote': {
      const { origin, destination, departure_date, return_date, passengers = 1, cabin_class = 'economy', customer_phone, customer_email, ticket_request_id } = toolInput;

      const results: any = {
        origin,
        destination,
        departure_date,
        return_date,
        passengers,
        cabin_class,
        searches: {},
        inventory: {},
        recommendation: null,
      };

      // 1. Search Perplexity for market prices
      if (PERPLEXITY_API_KEY) {
        try {
          const searchQuery = `Current lowest price for ${cabin_class} flight from ${origin} to ${destination} on ${departure_date}${return_date ? ` returning ${return_date}` : ' one-way'}. Show prices from Google Flights, Expedia, Kayak.`;

          const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'sonar',
              messages: [{ role: 'user', content: searchQuery }],
            }),
          });

          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content || '';

          // Extract price from response
          const priceMatch = answer.match(/\$\s*([\d,]+)/);
          const marketPrice = priceMatch ? parseInt(priceMatch[1].replace(',', '')) : null;

          results.searches.perplexity = {
            answer: answer.slice(0, 500),
            market_price: marketPrice,
            citations: data.citations?.slice(0, 3),
          };
        } catch (error) {
          results.searches.perplexity = { error: String(error) };
        }
      }

      // 2. Check Seats.aero for Alaska availability
      if (SEATS_AERO_API_KEY) {
        try {
          const response = await fetch(
            `https://seats.aero/api/availability?origin=${origin}&destination=${destination}&date=${departure_date}&source=alaska`,
            {
              headers: { 'Authorization': `Bearer ${SEATS_AERO_API_KEY}` },
            }
          );

          if (response.ok) {
            const data = await response.json();
            results.searches.seats_aero = {
              alaska_available: data.availability?.length > 0,
              options: data.availability?.slice(0, 3),
            };
          }
        } catch (error) {
          results.searches.seats_aero = { error: String(error) };
        }
      }

      // 3. Check our inventory
      const { data: giftCards } = await supabase
        .from('gift_cards')
        .select('*')
        .eq('status', 'active')
        .gte('balance', 100)
        .order('balance', { ascending: false })
        .limit(5);

      const { data: pointsAccounts } = await supabase
        .from('points_accounts')
        .select('*')
        .eq('status', 'active')
        .gte('points_balance', 10000)
        .order('points_balance', { ascending: false })
        .limit(5);

      results.inventory = {
        gift_cards: giftCards?.map((g: any) => ({
          airline: g.airline,
          balance: g.balance,
          id: g.id,
        })),
        points_accounts: pointsAccounts?.map((p: any) => ({
          airline: p.airline,
          points: p.points_balance,
          id: p.id,
        })),
      };

      // 4. Get pricing rules
      const { data: rules } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      // 5. Calculate quote
      const marketPrice = results.searches.perplexity?.market_price || 800;
      let discountPercent = 50; // Default 50% discount

      if (rules?.length) {
        for (const rule of rules) {
          if ((!rule.min_market_price || marketPrice >= rule.min_market_price) &&
              (!rule.max_market_price || marketPrice <= rule.max_market_price)) {
            discountPercent = rule.discount_percent;
            break;
          }
        }
      }

      const quotedPrice = Math.round(marketPrice * (1 - discountPercent / 100) * passengers);

      // Determine booking method
      let bookingMethod = 'gift_card';
      let inventoryId = null;

      // Check if Alaska available and we have points
      const alaskaPoints = pointsAccounts?.find((p: any) => p.airline === 'Alaska');
      if (results.searches.seats_aero?.alaska_available && alaskaPoints) {
        bookingMethod = 'alaska_points';
        inventoryId = alaskaPoints.id;
      } else if (giftCards?.length) {
        bookingMethod = 'gift_card';
        inventoryId = giftCards[0].id;
      }

      results.recommendation = {
        quoted_price: quotedPrice,
        market_price: marketPrice,
        discount_percent: discountPercent,
        booking_method: bookingMethod,
        inventory_id: inventoryId,
        confidence: marketPrice ? 'high' : 'medium',
        notes: results.searches.seats_aero?.alaska_available
          ? 'Alaska award availability confirmed'
          : 'Using gift card inventory',
      };

      // Log the quote
      await supabase.from('quote_logs').insert({
        route: `${origin} → ${destination}`,
        travel_dates: `${departure_date}${return_date ? ` - ${return_date}` : ''}`,
        passengers,
        market_price: marketPrice,
        quoted_price: quotedPrice,
        discount_applied: discountPercent,
        booking_method: bookingMethod,
        inventory_type: bookingMethod.includes('points') ? 'points' : 'gift_card',
        inventory_id: inventoryId,
        customer_phone,
        customer_email,
        ticket_request_id,
        status: 'quoted',
        auto_approved: true,
      });

      return JSON.stringify(results);
    }

    case 'check_inventory': {
      const { type = 'all', airline, min_balance } = toolInput;

      const result: any = {};

      if (type === 'all' || type === 'gift_cards') {
        let query = supabase
          .from('gift_cards')
          .select('*')
          .eq('status', 'active');

        if (airline) query = query.eq('airline', airline);
        if (min_balance) query = query.gte('balance', min_balance);

        const { data } = await query.order('balance', { ascending: false });
        result.gift_cards = data;
      }

      if (type === 'all' || type === 'points') {
        let query = supabase
          .from('points_accounts')
          .select('*')
          .eq('status', 'active');

        if (airline) query = query.eq('airline', airline);
        if (min_balance) query = query.gte('points_balance', min_balance);

        const { data } = await query.order('points_balance', { ascending: false });
        result.points_accounts = data;
      }

      return JSON.stringify(result);
    }

    case 'web_search': {
      const { query } = toolInput;

      if (!PERPLEXITY_API_KEY) {
        return JSON.stringify({ error: 'Perplexity not configured' });
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: query }],
        }),
      });

      const data = await response.json();
      return JSON.stringify({
        answer: data.choices?.[0]?.message?.content || 'No results',
        citations: data.citations || [],
      });
    }

    case 'search_alaska_availability': {
      const { origin, destination, date } = toolInput;

      if (!SEATS_AERO_API_KEY) {
        return JSON.stringify({ error: 'Seats.aero not configured' });
      }

      try {
        const response = await fetch(
          `https://seats.aero/api/availability?origin=${origin}&destination=${destination}&date=${date}&source=alaska`,
          {
            headers: { 'Authorization': `Bearer ${SEATS_AERO_API_KEY}` },
          }
        );

        if (!response.ok) {
          return JSON.stringify({ error: `Seats.aero error: ${response.status}` });
        }

        const data = await response.json();
        return JSON.stringify({
          available: data.availability?.length > 0,
          options: data.availability,
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    // === COMMUNICATION ===
    case 'notify_boss': {
      const { message, priority = 'normal' } = toolInput;

      if (!TELEGRAM_BOT_TOKEN) {
        return JSON.stringify({ error: 'Telegram not configured' });
      }

      const emoji = priority === 'urgent' ? '🚨' : priority === 'high' ? '❗' : priority === 'low' ? '📌' : '📢';
      const fullMessage = `${emoji} *Claude Update*\n\n${message}`;

      try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: fullMessage,
            parse_mode: 'Markdown',
          }),
        });

        if (response.ok) {
          return JSON.stringify({ success: true, message: 'Notification sent to boss' });
        } else {
          const error = await response.text();
          return JSON.stringify({ error: `Telegram error: ${error}` });
        }
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'instruct_maya': {
      const { instruction, customer_phone, expires_in_hours = 24 } = toolInput;

      const expires_at = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase.from('maya_prompt_adaptations').insert({
        adaptation_type: 'claude_instruction',
        content: instruction,
        scope: customer_phone ? 'customer' : 'global',
        scope_id: customer_phone,
        is_active: true,
        priority: 100,
        expires_at,
      }).select().single();

      if (error) {
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify({
        success: true,
        instruction_id: data.id,
        expires_at,
        scope: customer_phone ? `Customer: ${customer_phone}` : 'Global',
      });
    }

    case 'send_email': {
      const { to, subject, body } = toolInput;

      const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          type: 'custom_email',
          customerEmail: to,
          data: { subject, message: body },
        }),
      });

      const result = await response.json();
      return JSON.stringify(result);
    }

    // === DATABASE ===
    case 'database_query': {
      const { table, filters, limit = 10, order_by, ascending = false } = toolInput;

      let query = supabase.from(table).select('*');

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value);
        }
      }

      if (order_by) {
        query = query.order(order_by, { ascending });
      }

      const { data, error } = await query.limit(limit);

      if (error) {
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify(data);
    }

    case 'database_update': {
      const { table, id, data } = toolInput;

      const { data: result, error } = await supabase
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify({ success: true, updated: result });
    }

    // === GITHUB ===
    case 'github_read_file': {
      const { path } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
            },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to read file: ${error}` });
        }

        const data = await response.json();
        const content = atob(data.content);

        return JSON.stringify({
          path,
          content: content.length > 15000 ? content.slice(0, 15000) + '\n... (truncated)' : content,
          size: data.size,
          sha: data.sha,
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'github_write_file': {
      const { path, content, message } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        // Get existing file SHA if it exists
        let sha: string | undefined;
        const getResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
            },
          }
        );

        if (getResponse.ok) {
          const existingFile = await getResponse.json();
          sha = existingFile.sha;
        }

        // Create or update file
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `[Claude Manager] ${message}`,
              content: btoa(unescape(encodeURIComponent(content))),
              sha,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to write file: ${error}` });
        }

        const data = await response.json();

        return JSON.stringify({
          success: true,
          path,
          sha: data.content?.sha,
          action: sha ? 'updated' : 'created',
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'github_search': {
      const { query } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        const response = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${GITHUB_REPO}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
            },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Search failed: ${error}` });
        }

        const data = await response.json();

        return JSON.stringify({
          total: data.total_count,
          items: data.items?.slice(0, 10).map((item: any) => ({
            path: item.path,
            name: item.name,
          })),
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'github_list_files': {
      const { path } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path || ''}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
            },
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to list: ${error}` });
        }

        const data = await response.json();

        return JSON.stringify({
          path,
          files: Array.isArray(data) ? data.map((item: any) => ({
            name: item.name,
            type: item.type,
            path: item.path,
          })) : [data],
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'github_delete_file': {
      const { path, message } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured' });
      }

      try {
        // Get SHA first
        const getResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
          {
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
            },
          }
        );

        if (!getResponse.ok) {
          return JSON.stringify({ error: 'File not found' });
        }

        const existingFile = await getResponse.json();

        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Claude-Manager',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `[Claude Manager] ${message}`,
              sha: existingFile.sha,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          return JSON.stringify({ error: `Failed to delete: ${error}` });
        }

        return JSON.stringify({ success: true, path, message: 'File deleted' });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: ClaudeRequest = await req.json();

    const {
      messages,
      system = CLAUDE_MANAGER_SYSTEM,
      tools = [],
      max_tokens = 8192,
      temperature = 0.7,
    } = body;

    // Merge manager tools with any custom tools
    const allTools = [...MANAGER_TOOLS, ...tools];

    console.log(`[Claude Manager] Processing ${messages.length} messages with ${allTools.length} tools`);

    // Build Claude messages
    let claudeMessages: any[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let finalResponse: ClaudeResponse | null = null;
    let iterations = 0;
    const maxIterations = 15;

    while (iterations < maxIterations) {
      iterations++;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens,
          temperature,
          system,
          messages: claudeMessages,
          tools: allTools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Claude Manager] API error:', error);
        throw new Error(`Claude API error: ${error}`);
      }

      const claudeResponse: ClaudeResponse = await response.json();
      console.log(`[Claude Manager] Iteration ${iterations}, stop_reason: ${claudeResponse.stop_reason}`);

      // Check if Claude wants to use tools
      if (claudeResponse.stop_reason === 'tool_use') {
        const toolUseBlocks = claudeResponse.content.filter(c => c.type === 'tool_use');

        // Execute all tool calls
        const toolResults = await Promise.all(
          toolUseBlocks.map(async (toolBlock) => {
            const result = await executeToolCall(
              toolBlock.name!,
              toolBlock.input as Record<string, any>,
              supabase,
              SUPABASE_URL
            );
            return {
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id!,
              content: result,
            };
          })
        );

        // Add assistant message and tool results
        claudeMessages = [
          ...claudeMessages,
          { role: 'assistant', content: claudeResponse.content },
          { role: 'user', content: toolResults },
        ];

        continue;
      }

      // Claude finished
      finalResponse = claudeResponse;
      break;
    }

    if (!finalResponse) {
      throw new Error('Max iterations reached without final response');
    }

    // Extract text content
    const textContent = finalResponse.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return new Response(
      JSON.stringify({
        content: textContent,
        usage: finalResponse.usage,
        stop_reason: finalResponse.stop_reason,
        iterations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Claude Manager] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
