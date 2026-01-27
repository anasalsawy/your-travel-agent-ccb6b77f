/**
 * MEMORY TOOL - PRECISION MEMORY ACCESS FOR AGENTS
 * 
 * This module provides the tool definition that agents use to query
 * the unified raw memory. It's the interface between agents and
 * the Memory Agent's query capabilities.
 * 
 * Usage:
 * 1. Import this tool definition into your agent
 * 2. When the agent needs precise facts, it calls memory_tool
 * 3. The tool dispatches to the Memory Agent edge function
 * 
 * This is the "precision memory" layer - for exact receipts and facts.
 * For holistic understanding, agents use KB search.
 * For recent context, agents get short-term memory slice injected.
 */

// ═══════════════════════════════════════════════════════════════════
// TOOL DEFINITION (for LLM function calling)
// ═══════════════════════════════════════════════════════════════════

export const MEMORY_TOOL_DEFINITION = {
  name: "memory_tool",
  description: `Query the unified business memory for precise, factual, auditable recall.
Use this when you need EXACT details, receipts, or facts - not for general understanding.

Available query types:
- get_events_between: Get all events in a time range
- get_events_for_customer: Get all events for a specific customer (by ID, email, or phone)
- get_events_by_type: Get events of a specific type (quote_generated, order_created, etc.)
- get_session_history: Get full history for a conversation session
- get_recent_failed_payments: Get recent failed payment attempts
- get_quotes_by_status: Get quotes filtered by status
- get_activity_summary: Get aggregate statistics for a time period
- search_events: Search events by keyword

Returns structured JSON with all fields - nothing is hidden.`,
  
  parameters: {
    type: "object",
    properties: {
      query_type: {
        type: "string",
        enum: [
          "get_events_between",
          "get_events_for_customer", 
          "get_events_by_type",
          "get_session_history",
          "get_recent_failed_payments",
          "get_quotes_by_status",
          "get_activity_summary",
          "search_events"
        ],
        description: "The type of memory query to execute"
      },
      
      // For get_events_between
      start: {
        type: "string",
        description: "Start timestamp (ISO format) for time-range queries"
      },
      end: {
        type: "string", 
        description: "End timestamp (ISO format) for time-range queries"
      },
      event_types: {
        type: "array",
        items: { type: "string" },
        description: "Filter by event types (quote_generated, order_created, ticket_request, call_log, etc.)"
      },
      
      // For get_events_for_customer
      customer_id: {
        type: "string",
        description: "Customer UUID"
      },
      customer_email: {
        type: "string",
        description: "Customer email address"
      },
      customer_phone: {
        type: "string",
        description: "Customer phone number"
      },
      
      // For get_events_by_type
      event_type: {
        type: "string",
        description: "Single event type to filter"
      },
      
      // For get_session_history
      session_id: {
        type: "string",
        description: "Session ID or conversation ID"
      },
      
      // For get_quotes_by_status
      status: {
        type: "string",
        description: "Status to filter by (quoted, accepted, declined, etc.)"
      },
      
      // For search_events
      keyword: {
        type: "string",
        description: "Search keyword to find in event content"
      },
      
      // Common options
      limit: {
        type: "number",
        description: "Maximum number of results to return"
      },
      timeframe_days: {
        type: "number",
        description: "Lookback period in days (for queries that support it)"
      }
    },
    required: ["query_type"]
  }
};

// ═══════════════════════════════════════════════════════════════════
// TOOL EXECUTION HELPER
// ═══════════════════════════════════════════════════════════════════

interface MemoryToolParams {
  query_type: string;
  start?: string;
  end?: string;
  event_types?: string[];
  customer_id?: string;
  customer_email?: string;
  customer_phone?: string;
  event_type?: string;
  session_id?: string;
  status?: string;
  keyword?: string;
  limit?: number;
  timeframe_days?: number;
}

/**
 * Execute a memory tool call by dispatching to the Memory Agent
 */
export async function executeMemoryTool(
  params: MemoryToolParams,
  supabaseUrl: string,
  supabaseKey: string
): Promise<unknown> {
  // Build the query object based on query_type
  let query: { type: string; params: Record<string, unknown> };

  switch (params.query_type) {
    case 'get_events_between':
      query = {
        type: 'get_events_between',
        params: {
          start: params.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: params.end || new Date().toISOString(),
          eventTypes: params.event_types,
        }
      };
      break;

    case 'get_events_for_customer':
      query = {
        type: 'get_events_for_customer',
        params: {
          identifier: {
            customer_id: params.customer_id,
            email: params.customer_email,
            phone: params.customer_phone,
          },
          options: {
            start: params.start,
            end: params.end,
            limit: params.limit,
          }
        }
      };
      break;

    case 'get_events_by_type':
      query = {
        type: 'get_events_by_type',
        params: {
          eventType: params.event_type,
          start: params.start,
          end: params.end,
          limit: params.limit,
        }
      };
      break;

    case 'get_session_history':
      query = {
        type: 'get_session_history',
        params: {
          sessionId: params.session_id,
        }
      };
      break;

    case 'get_recent_failed_payments':
      query = {
        type: 'get_recent_failed_payments',
        params: {
          limit: params.limit || 20,
          timeframeDays: params.timeframe_days || 7,
        }
      };
      break;

    case 'get_quotes_by_status':
      query = {
        type: 'get_quotes_by_status',
        params: {
          status: params.status,
          limit: params.limit || 50,
          timeframeDays: params.timeframe_days || 14,
        }
      };
      break;

    case 'get_activity_summary':
      query = {
        type: 'get_activity_summary',
        params: {
          timeframeDays: params.timeframe_days || 7,
        }
      };
      break;

    case 'search_events':
      query = {
        type: 'search_events',
        params: {
          keyword: params.keyword,
          options: {
            start: params.start,
            end: params.end,
            eventTypes: params.event_types,
            limit: params.limit,
          }
        }
      };
      break;

    default:
      return { error: `Unknown query_type: ${params.query_type}` };
  }

  // Call the Memory Agent
  const response = await fetch(`${supabaseUrl}/functions/v1/memory-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'query',
      query,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { error: `Memory Agent error: ${error}` };
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
// SHORT-TERM MEMORY HELPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Get short-term memory slice for agent context injection
 */
export async function getShortTermMemorySlice(
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    lookback_hours?: number;
    format?: 'json' | 'text';
    focus_customer_id?: string;
  } = {}
): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/functions/v1/memory-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action: 'short_term',
      short_term_options: {
        lookback_hours: options.lookback_hours || 48,
        format: options.format || 'text',
        focus_customer_id: options.focus_customer_id,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { error: `Memory Agent error: ${error}` };
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE HELPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Get or refresh the Knowledge Base content
 */
export async function getKnowledgeBase(
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    refresh?: boolean;
    period_days?: number;
  } = {}
): Promise<unknown> {
  const action = options.refresh ? 'refresh_kb' : 'get_kb';

  const response = await fetch(`${supabaseUrl}/functions/v1/memory-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      action,
      kb_options: {
        period_days: options.period_days || 90,
        store: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { error: `Memory Agent error: ${error}` };
  }

  return response.json();
}
