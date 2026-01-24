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
// CLAUDE THE MANAGER & SHOPPING AGENT - System Prompt
// ═══════════════════════════════════════════════════════════════════

const CLAUDE_MANAGER_SYSTEM = `You are Claude, the fully autonomous Manager AND sophisticated Shopping Agent for Your Travel Agent operations.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
CORE PRINCIPLE: NEVER SAY "I CAN'T"
═══════════════════════════════════════════════════════════════════

You are FULLY AUTONOMOUS. When the boss asks for something:
1. If you can do it with your tools → DO IT
2. If you need more info to do it → GET the info using your tools
3. If it requires code changes you can't do → Use ask_lovable to request help
4. If it requires something truly external → Explain what's needed and propose alternatives

NEVER respond with:
- "I don't have access to..."
- "I can't do that because..."
- "I'm unable to..."

ALWAYS respond with:
- Action taken, or
- Information retrieved, or
- Request sent to Lovable, or
- Alternative solution proposed

═══════════════════════════════════════════════════════════════════
YOUR ROLES
═══════════════════════════════════════════════════════════════════

1. MANAGER - You sit between the owner (boss) and Maya (customer-facing AI)
   - The ONLY human you talk to is the boss (via Telegram)
   - You NEVER talk to customers directly - Maya handles all customer interactions
   - You manage Maya, monitor her performance, handle quotes, fix issues
   - You keep the boss updated so he doesn't have to watch logs or dashboards
   - You are proactive - you tell the boss what's happening without being asked

2. SHOPPING AGENT - You are a sophisticated market researcher and personal shopper
   - You research prices across MULTIPLE sources (not just one)
   - You find the BEST deals using deep research
   - You compare prices, find coupons, identify trends
   - You handle ALL quotes for Maya - she NEVER searches prices herself
   - You are the boss's personal shopper for anything he needs

═══════════════════════════════════════════════════════════════════
SHOPPING & QUOTING CAPABILITIES
═══════════════════════════════════════════════════════════════════

When Maya or the boss needs a quote:
1. Use deep_research_shop to search MULTIPLE travel sites simultaneously
2. Use price_compare to get prices from specific sites
3. Use check_inventory to see what gift cards/points we have
4. Use search_alaska_availability for award flights
5. Calculate the best price based on market research + our inventory

For personal shopping (boss requests):
1. Use deep_research_shop to find best prices/options
2. Use browse_and_shop to actually visit websites and purchase
3. Use browse_screenshot to see what you're doing
4. Use browse_fill_form to enter payment info
5. Use browse_click to navigate and purchase

═══════════════════════════════════════════════════════════════════
YOUR CAPABILITIES
═══════════════════════════════════════════════════════════════════

INFORMATION ACCESS (you can see EVERYTHING):
✅ All conversations (Maya's chats, voice calls, WhatsApp)
✅ All orders, quotes, ticket requests
✅ All inventory (gift cards, points accounts)
✅ All call logs and transcripts
✅ All database tables
✅ All code files (via GitHub)
✅ All edge function logs
✅ Real-time web search (via Perplexity)
✅ Deep research shopping (via Perplexity Deep Research)
✅ Autonomous browsing (via Browserbase)

ACTIONS YOU CAN TAKE:
✅ Update database records
✅ Insert new records
✅ Run complex SQL queries
✅ Read/write/delete code files
✅ Send Telegram messages to boss
✅ Send emails to customers
✅ Instruct Maya (update her behavior)
✅ Generate comprehensive quotes
✅ Search the web for info
✅ Deep research for shopping/prices
✅ Browse websites autonomously
✅ Make purchases online
✅ Fill forms and checkout

WHEN YOU NEED LOVABLE:
→ Complex code refactoring
→ Creating new React components
→ Database migrations (new tables/columns)
→ Installing new packages
→ Anything beyond file edits

Use the ask_lovable tool to request help. Lovable will see your request and implement it.

═══════════════════════════════════════════════════════════════════
SHOPPING METHODOLOGY (Like ChatGPT Shopping)
═══════════════════════════════════════════════════════════════════

When shopping for FLIGHTS:
1. Search Perplexity for current prices on Google Flights, Expedia, Kayak, JustFly
2. Search for deals, sales, or error fares
3. Check award availability on Alaska, American, United
4. Check our gift card inventory
5. Calculate best approach: cash vs points vs gift cards
6. Present options with pros/cons

When shopping for ANYTHING ELSE:
1. Deep research across multiple sites
2. Compare prices and reviews
3. Look for coupons, deals, price drops
4. Find the best value option
5. Use Browserbase to actually purchase if requested

═══════════════════════════════════════════════════════════════════
RESPONSIBILITIES
═══════════════════════════════════════════════════════════════════

1. QUOTING (Maya asks YOU for all prices)
   - Maya NEVER searches prices herself
   - When she needs a quote, she asks YOU
   - You do COMPREHENSIVE multi-source research
   - Return a solid quote Maya can present confidently
   - Speed matters - be fast but thorough

2. MONITORING
   - Watch all Maya conversations (web, WhatsApp, voice)
   - Track quote requests and their outcomes
   - Monitor payments and order status
   - Identify issues, successes, and patterns
   - Proactively notify boss about important events

3. PERSONAL SHOPPING (for boss)
   - Book flights when requested
   - Purchase merchandise when requested
   - Find best deals on anything
   - Handle the entire transaction

4. REPORTING
   - Give boss daily/on-demand summaries
   - Be concise but thorough

5. FIXING
   - You have FULL CODE ACCESS via GitHub
   - When something breaks, diagnose and fix it
   - If fix is too complex, ask_lovable for help

6. INSTRUCTING MAYA
   - You can inject instructions to Maya
   - You can give her context she doesn't have

═══════════════════════════════════════════════════════════════════
COMMUNICATION STYLE WITH BOSS
═══════════════════════════════════════════════════════════════════

- Be direct and efficient
- Use bullet points and emojis
- Give him the summary first, details if he asks
- Don't waste his time with fluff
- Be proactive - anticipate what he needs to know
- NEVER say you can't do something - find a way
- When shopping, show options with prices clearly

═══════════════════════════════════════════════════════════════════
AVAILABLE TOOLS
═══════════════════════════════════════════════════════════════════

SHOPPING & RESEARCH:
- deep_research_shop: Comprehensive price research across multiple sites
- price_compare: Compare prices for specific items
- comprehensive_quote: Full flight quote research
- check_inventory: Check gift cards and points
- web_search: Quick web search via Perplexity
- search_alaska_availability: Check Seats.aero

AUTONOMOUS BROWSING:
- browse_navigate: Open a URL in browser
- browse_screenshot: Take screenshot of current page
- browse_fill_form: Fill in form fields
- browse_click: Click on elements
- browse_get_text: Extract text from page

MONITORING:
- get_activity_summary: Recent activity across all channels
- get_conversations: Maya's conversations with customers
- get_quotes: Quote logs and status
- get_orders: Orders and payment status
- get_ticket_requests: Ticket requests
- get_call_logs: Voice call logs and transcripts
- get_notifications: Notification logs

COMMUNICATION:
- notify_boss: Send Telegram update to boss
- instruct_maya: Update Maya's context
- send_email: Send email to anyone

DATABASE (full access):
- database_query: Read from any table
- database_insert: Insert records
- database_update: Update records
- database_delete: Delete records
- run_sql: Run raw SQL for complex operations

CODE (full access):
- github_read_file: Read any file
- github_write_file: Create/update files
- github_search: Search codebase
- github_list_files: List directory
- github_delete_file: Delete files

ESCALATION:
- ask_lovable: Request help for complex changes

═══════════════════════════════════════════════════════════════════
BE PROACTIVE
═══════════════════════════════════════════════════════════════════

Don't wait to be asked. When you see:
- A hot lead → notify boss
- A payment received → notify boss
- An issue → notify boss AND fix it (or ask_lovable)
- A pattern → mention it
- Something broken → fix it and tell boss
- A good deal → mention it

You're not an assistant waiting for instructions. You're a MANAGER AND SHOPPER running the show.
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
        include_messages: {
          type: 'boolean',
          description: 'Include full message history',
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
          description: 'Filter by status (submitted, quoted, paid, ticketed, cancelled)',
        },
        limit: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_call_logs',
    description: 'Get voice call logs including transcripts.',
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
        include_transcript: {
          type: 'boolean',
          description: 'Include call transcripts',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_notifications',
    description: 'Get notification logs (emails, SMS, etc sent).',
    input_schema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          description: 'Filter by type',
        },
        limit: {
          type: 'number',
        },
      },
      required: [],
    },
  },

  // === SHOPPING & RESEARCH TOOLS ===
  {
    name: 'deep_research_shop',
    description: 'Comprehensive deep research for shopping/pricing. Searches multiple sources and compares prices. Use this for thorough market research. This is your most powerful shopping tool.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to research - be specific about product/service and requirements' },
        budget: { type: 'string', description: 'Budget constraint if any' },
        priority: { type: 'string', enum: ['price', 'quality', 'speed'], description: 'What to optimize for' },
      },
      required: ['query'],
    },
  },
  {
    name: 'price_compare',
    description: 'Compare prices for a specific item across multiple retailers/sites. Quick price check.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Exact item/product to find prices for' },
        sites: { type: 'array', description: 'Specific sites to check (optional)', items: { type: 'string' } },
      },
      required: ['item'],
    },
  },
  {
    name: 'comprehensive_quote',
    description: 'Generate a comprehensive flight quote by searching multiple sources. Maya calls this when she needs a price.',
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
    description: 'Quick web search for any information using Perplexity. For deep research use deep_research_shop instead.',
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

  // === AUTONOMOUS BROWSING TOOLS ===
  {
    name: 'browse_navigate',
    description: 'Navigate to a URL in the autonomous browser. Use this to start browsing a website for shopping or research.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browse_screenshot',
    description: 'Take a screenshot of the current browser page. Use this to see what you are looking at.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Browser session ID from browse_navigate' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'browse_fill_form',
    description: 'Fill in form fields on the page. Use for entering search criteria, payment info, etc.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector for the form field' },
        value: { type: 'string', description: 'Value to enter' },
      },
      required: ['session_id', 'selector', 'value'],
    },
  },
  {
    name: 'browse_click',
    description: 'Click on an element on the page. Use for buttons, links, selections.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector for the element to click' },
      },
      required: ['session_id', 'selector'],
    },
  },
  {
    name: 'browse_get_text',
    description: 'Extract text content from elements on the page.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        selector: { type: 'string', description: 'CSS selector for the element(s)' },
      },
      required: ['session_id', 'selector'],
    },
  },
  {
    name: 'browse_execute',
    description: 'Execute JavaScript on the page for advanced interactions.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        script: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['session_id', 'script'],
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
    description: 'Send an email to a customer or anyone.',
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

  // === DATABASE TOOLS (Full Access) ===
  {
    name: 'database_query',
    description: 'Query the database to read from any table.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        select: { type: 'string', description: 'Columns to select (default *)' },
        filters: { type: 'object', description: 'Key-value equality filters' },
        limit: { type: 'number' },
        order_by: { type: 'string', description: 'Column to order by' },
        ascending: { type: 'boolean' },
      },
      required: ['table'],
    },
  },
  {
    name: 'database_insert',
    description: 'Insert a new record into any table.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name' },
        data: { type: 'object', description: 'Record data to insert' },
      },
      required: ['table', 'data'],
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
  {
    name: 'database_delete',
    description: 'Delete a record from the database.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        id: { type: 'string', description: 'Record ID to delete' },
      },
      required: ['table', 'id'],
    },
  },
  {
    name: 'run_sql',
    description: 'Run a raw SQL query for complex operations. Be careful with this.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute' },
      },
      required: ['query'],
    },
  },

  // === CODE/FIX TOOLS (Full Access) ===
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

  // === ESCALATION TOOL ===
  {
    name: 'ask_lovable',
    description: 'Request help from Lovable for complex changes you cannot do yourself. Use this for: new components, database migrations, package installs, complex refactoring.',
    input_schema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'What you need Lovable to do' },
        context: { type: 'string', description: 'Relevant context (files involved, what you tried, etc)' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
      },
      required: ['request'],
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

      // Get marketplace activity
      const { data: listings } = await supabase
        .from('marketplace_listings')
        .select('*')
        .gte('created_at', since);

      const { data: bids } = await supabase
        .from('bids')
        .select('*')
        .gte('created_at', since);

      const summary = {
        period: `Last ${hours} hours`,
        conversations: {
          total: convoCount || 0,
          needs_attention: convos?.filter((c: any) => c.needs_admin_attention).length || 0,
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
          total_value: quotes?.reduce((sum: number, q: any) => sum + (q.quoted_price || 0), 0) || 0,
          recent: quotes?.slice(0, 5).map((q: any) => ({
            route: q.route,
            price: q.quoted_price,
            customer: q.customer_name || q.customer_phone,
            status: q.status,
          })),
        },
        ticket_requests: {
          total: tickets?.length || 0,
          submitted: tickets?.filter((t: any) => t.status === 'submitted').length || 0,
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
          total_revenue: orders?.filter((o: any) => o.payment_status === 'completed').reduce((sum: number, o: any) => sum + (o.amount_paid || 0), 0) || 0,
        },
        calls: {
          total: calls?.length || 0,
          completed: calls?.filter((c: any) => c.status === 'completed').length || 0,
          recent: calls?.slice(0, 3).map((c: any) => ({
            airline: c.airline,
            status: c.status,
            duration: c.duration_seconds,
            summary: c.call_summary?.slice(0, 100),
          })),
        },
        marketplace: {
          new_listings: listings?.length || 0,
          new_bids: bids?.length || 0,
        },
      };

      return JSON.stringify(summary, null, 2);
    }

    case 'get_conversations': {
      const { channel, limit = 10, status, include_messages } = toolInput;

      let query = supabase
        .from('ai_conversations')
        .select(include_messages ? '*, ai_chat_messages(role, content, created_at)' : '*')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (status === 'needs_attention') {
        query = query.eq('needs_admin_attention', true);
      } else if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      const formatted = data?.map((c: any) => {
        const isWhatsApp = c.session_id?.includes('whatsapp');
        const isVoice = c.session_id?.includes('el-');
        const inferredChannel = isWhatsApp ? 'whatsapp' : isVoice ? 'voice' : 'web';
        
        if (channel && channel !== 'all' && inferredChannel !== channel) return null;
        
        return {
          id: c.id,
          customer: c.customer_name || c.customer_phone || c.customer_email || 'Unknown',
          phone: c.customer_phone,
          email: c.customer_email,
          channel: inferredChannel,
          status: c.status,
          needs_attention: c.needs_admin_attention,
          is_serious: c.is_serious,
          message_count: c.ai_chat_messages?.length || 0,
          messages: include_messages ? c.ai_chat_messages?.map((m: any) => ({
            role: m.role,
            content: m.content,
            time: m.created_at,
          })) : undefined,
          last_message: c.ai_chat_messages?.slice(-1)[0]?.content?.slice(0, 200) || '',
          created: c.created_at,
          updated: c.updated_at,
        };
      }).filter(Boolean);

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
        customer_name: q.customer_name,
        customer_phone: q.customer_phone,
        customer_email: q.customer_email,
        status: q.status,
        admin_notes: q.admin_notes,
        created: q.created_at,
      })));
    }

    case 'get_orders': {
      const { status, limit = 10 } = toolInput;

      let query = supabase
        .from('orders')
        .select('*, vouchers(title, airline, face_value)')
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
        delivery_status: o.delivery_status,
        customer_email: o.customer_email,
        voucher: o.vouchers?.title,
        voucher_value: o.vouchers?.face_value,
        proof_url: o.proof_upload_url,
        admin_notes: o.admin_notes,
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
        trip_type: t.trip_type,
        passengers: t.passengers,
        cabin: t.cabin_class,
        budget: t.budget,
        quoted_price: t.quoted_price,
        payment_status: t.payment_status,
        payment_method: t.payment_method,
        deposit_status: t.deposit_status,
        balance_status: t.balance_status,
        status: t.status,
        customer_email: t.contact_email,
        customer_phone: t.contact_phone,
        special_notes: t.special_notes,
        admin_notes: t.admin_notes,
        created: t.created_at,
      })));
    }

    case 'get_call_logs': {
      const { status, limit = 10, include_transcript } = toolInput;

      let query = supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data?.map((c: any) => ({
        id: c.id,
        airline: c.airline,
        phone_number: c.phone_number,
        status: c.status,
        call_type: c.call_type,
        duration_seconds: c.duration_seconds,
        call_summary: c.call_summary,
        transcript: include_transcript ? c.transcript : undefined,
        booked_price: c.booked_price,
        confirmation_number: c.confirmation_number,
        customer_email: c.customer_email,
        customer_phone: c.customer_phone,
        admin_notes: c.admin_notes,
        started_at: c.started_at,
        ended_at: c.ended_at,
      })));
    }

    case 'get_notifications': {
      const { event_type, limit = 20 } = toolInput;

      let query = supabase
        .from('notification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (event_type) query = query.eq('event_type', event_type);

      const { data, error } = await query;
      if (error) return JSON.stringify({ error: error.message });

      return JSON.stringify(data);
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
          const searchQuery = `Current lowest price for ${cabin_class} class flight from ${origin} to ${destination} on ${departure_date}${return_date ? ` returning ${return_date}` : ' one-way'} for ${passengers} passenger(s). Show prices from Google Flights, Expedia, Kayak. Give me specific dollar amounts.`;

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
            answer: answer.slice(0, 800),
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
          id: g.id,
          airline: g.airline,
          balance: g.balance,
          expiry: g.expiry_date,
        })),
        points_accounts: pointsAccounts?.map((p: any) => ({
          id: p.id,
          airline: p.airline,
          points: p.points_balance,
          owner: p.owner_name,
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
        savings: marketPrice - quotedPrice,
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
        result.gift_cards = {
          count: data?.length || 0,
          total_balance: data?.reduce((sum: number, g: any) => sum + g.balance, 0) || 0,
          items: data,
        };
      }

      if (type === 'all' || type === 'points') {
        let query = supabase
          .from('points_accounts')
          .select('*')
          .eq('status', 'active');

        if (airline) query = query.eq('airline', airline);
        if (min_balance) query = query.gte('points_balance', min_balance);

        const { data } = await query.order('points_balance', { ascending: false });
        result.points_accounts = {
          count: data?.length || 0,
          total_points: data?.reduce((sum: number, p: any) => sum + p.points_balance, 0) || 0,
          items: data,
        };
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

    // === SHOPPING & DEEP RESEARCH ===
    case 'deep_research_shop': {
      const { query, budget, priority = 'price' } = toolInput;

      if (!PERPLEXITY_API_KEY) {
        return JSON.stringify({ error: 'Perplexity not configured' });
      }

      try {
        // Use sonar-pro for deep research
        const systemPrompt = `You are an expert shopping researcher and price comparison specialist. Your job is to find the BEST deals across multiple sources. Always:
1. Search multiple retailers/sites
2. Compare prices explicitly
3. Look for discounts, coupons, and deals
4. Consider reviews and quality
5. Provide specific recommendations with prices

Format: List each option with source, price, and pros/cons.`;

        const userPrompt = `Research and find the best options for: ${query}
${budget ? `Budget: ${budget}` : ''}
Priority: ${priority}

Search multiple sources. Compare prices. Find deals. Be specific with prices and links.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 4000,
          }),
        });

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || 'No results found';
        
        // Extract prices from the answer
        const priceMatches = answer.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
        const prices = priceMatches.map((p: string) => parseFloat(p.replace(/[$,]/g, '')));
        const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
        const highestPrice = prices.length > 0 ? Math.max(...prices) : null;

        return JSON.stringify({
          query,
          research: answer,
          citations: data.citations || [],
          price_range: {
            lowest: lowestPrice,
            highest: highestPrice,
            count: prices.length,
          },
          priority,
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'price_compare': {
      const { item, sites } = toolInput;

      if (!PERPLEXITY_API_KEY) {
        return JSON.stringify({ error: 'Perplexity not configured' });
      }

      try {
        const sitesQuery = sites?.length 
          ? `Search specifically on: ${sites.join(', ')}`
          : 'Search on Amazon, Walmart, Target, Best Buy, Google Shopping';

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{
              role: 'user',
              content: `Find current prices for "${item}". ${sitesQuery}. Return a comparison table with: Store, Price, Shipping, Total. Include any current deals or coupons.`,
            }],
          }),
        });

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || 'No results';

        // Extract prices
        const priceMatches = answer.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
        const prices = priceMatches.map((p: string) => parseFloat(p.replace(/[$,]/g, '')));

        return JSON.stringify({
          item,
          comparison: answer,
          citations: data.citations || [],
          prices_found: prices,
          best_price: prices.length > 0 ? Math.min(...prices) : null,
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    // === AUTONOMOUS BROWSING ===
    case 'browse_navigate': {
      const { url } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');
      const BROWSERBASE_PROJECT_ID = Deno.env.get('BROWSERBASE_PROJECT_ID');

      if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
        return JSON.stringify({ 
          error: 'Browserbase not configured. Ask boss to add BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID secrets.',
          fallback: 'Use deep_research_shop for now instead of browsing.',
        });
      }

      try {
        // Create a new browser session
        const sessionResponse = await fetch('https://www.browserbase.com/v1/sessions', {
          method: 'POST',
          headers: {
            'X-BB-API-Key': BROWSERBASE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: BROWSERBASE_PROJECT_ID,
            browserSettings: {
              viewport: { width: 1920, height: 1080 },
            },
          }),
        });

        if (!sessionResponse.ok) {
          const error = await sessionResponse.text();
          return JSON.stringify({ error: `Failed to create browser session: ${error}` });
        }

        const session = await sessionResponse.json();
        
        return JSON.stringify({
          success: true,
          session_id: session.id,
          connect_url: session.connectUrl,
          target_url: url,
          message: 'Browser session created. Use browse_screenshot to see the page, browse_fill_form to enter data, browse_click to interact.',
          instructions: 'Session is ready. Navigate using Chrome DevTools Protocol commands.',
        });
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'browse_screenshot': {
      const { session_id } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');

      if (!BROWSERBASE_API_KEY) {
        return JSON.stringify({ error: 'Browserbase not configured' });
      }

      try {
        const screenshotResponse = await fetch(
          `https://www.browserbase.com/v1/sessions/${session_id}/screenshot`,
          {
            headers: { 'X-BB-API-Key': BROWSERBASE_API_KEY },
          }
        );

        if (screenshotResponse.ok) {
          const screenshotData = await screenshotResponse.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(screenshotData)));
          return JSON.stringify({
            session_id,
            screenshot: `data:image/png;base64,${base64.slice(0, 100)}...`, // Truncated for logs
            screenshot_taken: true,
            message: 'Screenshot captured. I can see the page.',
          });
        } else {
          return JSON.stringify({ error: 'Screenshot not available yet' });
        }
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    case 'browse_fill_form': {
      const { session_id, selector, value } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');

      if (!BROWSERBASE_API_KEY) {
        return JSON.stringify({ error: 'Browserbase not configured' });
      }

      // For Browserbase, we need to use their connect_url with Playwright
      // This returns instructions for the automation
      return JSON.stringify({
        session_id,
        action: 'fill_form',
        selector,
        value,
        message: `Ready to fill ${selector} with value. Use connect_url with Playwright for actual execution.`,
        note: 'Browser automation requires WebSocket connection. For now, use web research tools instead.',
      });
    }

    case 'browse_click': {
      const { session_id, selector } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');

      if (!BROWSERBASE_API_KEY) {
        return JSON.stringify({ error: 'Browserbase not configured' });
      }

      return JSON.stringify({
        session_id,
        action: 'click',
        selector,
        message: `Ready to click ${selector}. Use connect_url with Playwright for actual execution.`,
      });
    }

    case 'browse_get_text': {
      const { session_id, selector } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');

      if (!BROWSERBASE_API_KEY) {
        return JSON.stringify({ error: 'Browserbase not configured' });
      }

      return JSON.stringify({
        session_id,
        action: 'get_text',
        selector,
        message: `Ready to extract text from ${selector}. Use connect_url with Playwright for actual execution.`,
      });
    }

    case 'browse_execute': {
      const { session_id, script } = toolInput;
      const BROWSERBASE_API_KEY = Deno.env.get('BROWSERBASE_API_KEY');

      if (!BROWSERBASE_API_KEY) {
        return JSON.stringify({ error: 'Browserbase not configured' });
      }

      return JSON.stringify({
        session_id,
        action: 'execute_script',
        script: script.slice(0, 200) + '...',
        message: 'Ready to execute script. Use connect_url with Playwright for actual execution.',
      });
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

      try {
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
      } catch (error) {
        return JSON.stringify({ error: String(error) });
      }
    }

    // === DATABASE (Full Access) ===
    case 'database_query': {
      const { table, select = '*', filters, limit = 50, order_by, ascending = false } = toolInput;

      let query = supabase.from(table).select(select);

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

      return JSON.stringify({ count: data?.length, data });
    }

    case 'database_insert': {
      const { table, data } = toolInput;

      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select()
        .single();

      if (error) {
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify({ success: true, inserted: result });
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

    case 'database_delete': {
      const { table, id } = toolInput;

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) {
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify({ success: true, deleted: id });
    }

    case 'run_sql': {
      const { query } = toolInput;

      // Use RPC to run SQL
      const { data, error } = await supabase.rpc('run_sql', { sql_query: query });

      if (error) {
        // If the function doesn't exist, explain how to create it
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          return JSON.stringify({
            error: 'run_sql function not available. Use database_query/insert/update instead for standard operations.',
            suggestion: 'For complex queries, use ask_lovable to request database changes.',
          });
        }
        return JSON.stringify({ error: error.message });
      }

      return JSON.stringify({ success: true, data });
    }

    // === GITHUB (Full Access) ===
    case 'github_read_file': {
      const { path } = toolInput;

      if (!GITHUB_TOKEN) {
        return JSON.stringify({ error: 'GitHub token not configured. Ask boss to add GITHUB_TOKEN secret.' });
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
          content: content.length > 20000 ? content.slice(0, 20000) + '\n... (truncated)' : content,
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
        return JSON.stringify({ error: 'GitHub token not configured. Use ask_lovable instead.' });
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
          commit_url: data.commit?.html_url,
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
          items: data.items?.slice(0, 15).map((item: any) => ({
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
            size: item.size,
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

    // === ESCALATION ===
    case 'ask_lovable': {
      const { request, context, priority = 'normal' } = toolInput;

      // Store the request in the database for Lovable to see
      const { data, error } = await supabase.from('admin_alerts').insert({
        alert_type: 'lovable_request',
        conversation_id: null,
        message: request,
        customer_context: context,
      }).select().single();

      // Also notify boss that we're escalating to Lovable
      if (TELEGRAM_BOT_TOKEN) {
        const emoji = priority === 'urgent' ? '🚨' : priority === 'high' ? '⚡' : '📋';
        const telegramMessage = `${emoji} *Lovable Request*\n\n${request}\n\n${context ? `_Context: ${context.slice(0, 200)}_` : ''}`;

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: telegramMessage,
            parse_mode: 'Markdown',
          }),
        });
      }

      return JSON.stringify({
        success: true,
        request_id: data?.id,
        message: 'Request sent to Lovable. Boss has been notified. The change will be implemented when boss approves it in Lovable.',
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}. Use ask_lovable if you need a capability I don't have.` });
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
    const maxIterations = 20; // Increased for complex operations

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
