/**
 * ANAS MEMORY TRIO - UNIFIED MEMORY CORE
 * 
 * ONE unified memory file, THREE access patterns:
 * 1. Full KB: The complete unified memory stored in Knowledge Base
 * 2. Slice: Most recent events loaded as conversation context
 * 3. Tool: Precision queries against the unified memory
 * 
 * This is the SINGLE SOURCE OF TRUTH.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// UNIFIED EVENT TYPE
// ═══════════════════════════════════════════════════════════════════

export interface UnifiedEvent {
  id: string;
  ts: string;           // ISO timestamp
  type: string;         // Event type (conversation, quote, order, etc.)
  channel?: string;     // web, whatsapp, voice
  data: Record<string, unknown>;
}

export interface UnifiedMemory {
  version: string;
  generated_at: string;
  period: { start: string; end: string };
  total_events: number;
  events: UnifiedEvent[];
}

// ═══════════════════════════════════════════════════════════════════
// CORE: FETCH UNIFIED MEMORY (Single Source)
// ═══════════════════════════════════════════════════════════════════

export async function fetchUnifiedMemory(
  supabase: SupabaseClient,
  options: {
    days?: number;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<UnifiedMemory> {
  const now = new Date();
  const days = options.days || 90;
  const endDate = options.endDate || now.toISOString();
  const startDate = options.startDate || new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const events: UnifiedEvent[] = [];

  // Fetch all data sources in parallel
  const [
    conversations, messages, quotes, orders, tickets,
    calls, notifications, alerts, bookings, reviews,
    listings, bids
  ] = await Promise.all([
    supabase.from("ai_conversations").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("ai_chat_messages").select("*, ai_conversations(session_id)").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("quote_logs").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("orders").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("ticket_requests").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("call_logs").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("notification_log").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("admin_alerts").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("booking_queue").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("maya_conversation_reviews").select("*").gte("reviewed_at", startDate).lte("reviewed_at", endDate).order("reviewed_at"),
    supabase.from("marketplace_listings").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
    supabase.from("bids").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at"),
  ]);

  // Transform to unified format
  const getChannel = (sessionId?: string) => {
    if (!sessionId) return undefined;
    if (sessionId.startsWith('whatsapp-')) return 'whatsapp';
    if (sessionId.startsWith('el-') || sessionId.startsWith('elevenlabs-')) return 'voice';
    return 'web';
  };

  // Conversations
  (conversations.data || []).forEach(c => {
    events.push({ id: c.id, ts: c.created_at, type: 'conversation_started', channel: getChannel(c.session_id), data: c });
  });

  // Messages
  (messages.data || []).forEach(m => {
    const sessionId = (m.ai_conversations as { session_id?: string })?.session_id;
    events.push({ id: m.id, ts: m.created_at, type: 'message', channel: getChannel(sessionId), data: { ...m, ai_conversations: undefined } });
  });

  // Quotes
  (quotes.data || []).forEach(q => {
    events.push({ id: q.id, ts: q.created_at, type: 'quote', data: q });
  });

  // Orders
  (orders.data || []).forEach(o => {
    events.push({ id: o.id, ts: o.created_at, type: 'order', data: o });
  });

  // Tickets
  (tickets.data || []).forEach(t => {
    events.push({ id: t.id, ts: t.created_at, type: 'ticket', data: t });
  });

  // Calls
  (calls.data || []).forEach(c => {
    events.push({ id: c.id, ts: c.created_at, type: 'call', data: c });
  });

  // Notifications
  (notifications.data || []).forEach(n => {
    events.push({ id: n.id, ts: n.created_at, type: 'notification', data: n });
  });

  // Alerts
  (alerts.data || []).forEach(a => {
    events.push({ id: a.id, ts: a.created_at, type: 'alert', data: a });
  });

  // Bookings
  (bookings.data || []).forEach(b => {
    events.push({ id: b.id, ts: b.created_at, type: 'booking', data: b });
  });

  // Reviews
  (reviews.data || []).forEach(r => {
    events.push({ id: r.id, ts: r.reviewed_at, type: 'review', data: r });
  });

  // Listings
  (listings.data || []).forEach(l => {
    events.push({ id: l.id, ts: l.created_at, type: 'listing', data: l });
  });

  // Bids
  (bids.data || []).forEach(b => {
    events.push({ id: b.id, ts: b.created_at, type: 'bid', data: b });
  });

  // Sort chronologically
  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return {
    version: '1.0',
    generated_at: now.toISOString(),
    period: { start: startDate, end: endDate },
    total_events: events.length,
    events,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ACCESS PATTERN 1: FULL KB (Store/Retrieve Complete Memory)
// ═══════════════════════════════════════════════════════════════════

export async function saveUnifiedMemoryToKB(
  supabase: SupabaseClient,
  memory: UnifiedMemory
): Promise<void> {
  const content = JSON.stringify(memory, null, 2);
  
  await supabase.from('agent_memory_cache').upsert({
    memory_type: 'unified_memory',
    compiled_content: content,
    compiled_at: memory.generated_at,
    stats: {
      total_events: memory.total_events,
      period_start: memory.period.start,
      period_end: memory.period.end,
      version: memory.version,
    }
  }, { onConflict: 'memory_type' });
}

export async function loadUnifiedMemoryFromKB(
  supabase: SupabaseClient
): Promise<UnifiedMemory | null> {
  const { data } = await supabase
    .from('agent_memory_cache')
    .select('compiled_content')
    .eq('memory_type', 'unified_memory')
    .maybeSingle();

  if (!data?.compiled_content) return null;
  return JSON.parse(data.compiled_content);
}

// ═══════════════════════════════════════════════════════════════════
// ACCESS PATTERN 2: SLICE (Recent Events for Context)
// ═══════════════════════════════════════════════════════════════════

export interface MemorySlice {
  generated_at: string;
  lookback_hours: number;
  events_count: number;
  content: string;
}

export function generateSlice(
  memory: UnifiedMemory,
  options: {
    hours?: number;
    maxTokens?: number;
    focusTypes?: string[];
  } = {}
): MemorySlice {
  const hours = options.hours || 24;
  const maxChars = (options.maxTokens || 8000) * 4; // ~4 chars per token
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Filter recent events
  let recentEvents = memory.events.filter(e => e.ts >= cutoff);
  
  // Focus on specific types if requested
  if (options.focusTypes?.length) {
    recentEvents = recentEvents.filter(e => options.focusTypes!.includes(e.type));
  }

  // Build slice content (newest first for context)
  const lines: string[] = [
    `📍 RECENT ACTIVITY (Last ${hours}h)`,
    `Generated: ${new Date().toISOString()}`,
    `Events: ${recentEvents.length}`,
    '---',
  ];

  // Add events newest-first, respecting token budget
  const reversedEvents = [...recentEvents].reverse();
  let charCount = lines.join('\n').length;

  for (const event of reversedEvents) {
    const eventLine = formatEventForSlice(event);
    if (charCount + eventLine.length > maxChars) break;
    lines.push(eventLine);
    charCount += eventLine.length;
  }

  return {
    generated_at: new Date().toISOString(),
    lookback_hours: hours,
    events_count: recentEvents.length,
    content: lines.join('\n'),
  };
}

function formatEventForSlice(event: UnifiedEvent): string {
  const time = new Date(event.ts).toLocaleString();
  const channel = event.channel ? `[${event.channel}]` : '';
  
  switch (event.type) {
    case 'message':
      return `${time} ${channel} 💬 ${event.data.role}: ${(event.data.content as string)?.slice(0, 100)}...`;
    case 'quote':
      return `${time} 💰 Quote: ${event.data.route} - $${event.data.quoted_price} (${event.data.status})`;
    case 'order':
      return `${time} 🛒 Order: $${event.data.amount_paid} - ${event.data.order_status}/${event.data.payment_status}`;
    case 'ticket':
      return `${time} ✈️ Ticket: ${event.data.origin}→${event.data.destination} - ${event.data.status}`;
    case 'call':
      return `${time} 📞 Call: ${event.data.airline} - ${event.data.status}`;
    case 'alert':
      return `${time} ⚠️ Alert: ${event.data.alert_type} - ${event.data.message}`;
    default:
      return `${time} ${event.type}: ${JSON.stringify(event.data).slice(0, 80)}...`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ACCESS PATTERN 3: PRECISION TOOL (Query Unified Memory)
// ═══════════════════════════════════════════════════════════════════

export type QueryType = 
  | 'events_between'
  | 'events_by_type'
  | 'events_for_customer'
  | 'session_history'
  | 'recent_by_type'
  | 'search_content';

export interface MemoryQuery {
  type: QueryType;
  params: Record<string, unknown>;
}

export function queryUnifiedMemory(
  memory: UnifiedMemory,
  query: MemoryQuery
): UnifiedEvent[] {
  const { type, params } = query;

  switch (type) {
    case 'events_between': {
      const start = params.start as string;
      const end = params.end as string;
      return memory.events.filter(e => e.ts >= start && e.ts <= end);
    }

    case 'events_by_type': {
      const eventType = params.type as string;
      const limit = (params.limit as number) || 100;
      return memory.events.filter(e => e.type === eventType).slice(-limit);
    }

    case 'events_for_customer': {
      const customerId = params.customer_id as string;
      const email = params.email as string;
      const phone = params.phone as string;
      
      return memory.events.filter(e => {
        const d = e.data;
        return d.customer_id === customerId || 
               d.customer_email === email ||
               d.contact_email === email ||
               d.customer_phone === phone ||
               d.contact_phone === phone;
      });
    }

    case 'session_history': {
      const sessionId = params.session_id as string;
      return memory.events.filter(e => 
        e.data.session_id === sessionId || 
        e.data.conversation_id === sessionId
      );
    }

    case 'recent_by_type': {
      const eventType = params.type as string;
      const hours = (params.hours as number) || 24;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      return memory.events.filter(e => e.type === eventType && e.ts >= cutoff);
    }

    case 'search_content': {
      const term = (params.term as string).toLowerCase();
      const limit = (params.limit as number) || 50;
      return memory.events
        .filter(e => JSON.stringify(e.data).toLowerCase().includes(term))
        .slice(-limit);
    }

    default:
      return [];
  }
}

// Tool definition for LLM agents
export const MEMORY_TOOL_DEFINITION = {
  name: 'memory_tool',
  description: 'Query the unified memory for precise, factual recall. Use for exact details, receipts, and auditable facts.',
  parameters: {
    type: 'object',
    properties: {
      query_type: {
        type: 'string',
        enum: ['events_between', 'events_by_type', 'events_for_customer', 'session_history', 'recent_by_type', 'search_content'],
        description: 'Type of query to execute'
      },
      start: { type: 'string', description: 'Start timestamp (ISO) for events_between' },
      end: { type: 'string', description: 'End timestamp (ISO) for events_between' },
      type: { type: 'string', description: 'Event type (message, quote, order, ticket, call, etc.)' },
      customer_id: { type: 'string', description: 'Customer UUID' },
      email: { type: 'string', description: 'Customer email' },
      phone: { type: 'string', description: 'Customer phone' },
      session_id: { type: 'string', description: 'Session/conversation ID' },
      hours: { type: 'number', description: 'Lookback hours for recent queries' },
      term: { type: 'string', description: 'Search term for content search' },
      limit: { type: 'number', description: 'Max results to return' },
    },
    required: ['query_type']
  }
};
