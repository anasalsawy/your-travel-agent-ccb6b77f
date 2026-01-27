/**
 * SHORT-TERM MEMORY - CONTEXT SLICE GENERATOR
 * 
 * Generates a compact, token-budgeted slice of recent events
 * that can be injected directly into an agent's context.
 * 
 * Properties:
 * - Stays within safe token budget
 * - Focuses on recent actions, ongoing issues, active flows
 * - Deterministic (no hallucination, no creative storytelling)
 * - Separate from KB long-term memory
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUnifiedRawMemory, RawEvent } from "./unified-raw-memory.ts";

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// Approximate max tokens for short-term memory slice
// ~4 chars per token, targeting ~8K tokens = ~32K chars
const MAX_SLICE_CHARS = 32000;

// Default lookback window in hours
const DEFAULT_LOOKBACK_HOURS = 48;

// Priority weights for event types (higher = more important to include)
const EVENT_PRIORITY: Record<string, number> = {
  'order_created': 10,
  'ticket_request': 9,
  'quote_generated': 8,
  'call_log': 8,
  'admin_alert': 7,
  'booking_queued': 6,
  'conversation_review': 5,
  'conversation_started': 4,
  'notification_sent': 3,
  'chat_message': 2,
  'marketplace_listing': 4,
  'bid_placed': 4,
};

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ShortTermMemorySlice {
  generated_at: string;
  lookback_hours: number;
  token_budget: number;
  estimated_tokens: number;
  
  // Summary section
  summary: {
    period: string;
    total_events: number;
    events_included: number;
    active_customers: string[];
    pending_items: {
      orders_pending: number;
      tickets_pending: number;
      quotes_awaiting: number;
      bookings_queued: number;
    };
  };
  
  // Recent high-priority events (structured)
  recent_events: Array<{
    timestamp: string;
    type: string;
    channel?: string;
    summary: string;
    key_data: Record<string, unknown>;
  }>;
  
  // Active threads (ongoing issues/conversations)
  active_threads: Array<{
    id: string;
    type: string;
    status: string;
    last_activity: string;
    context: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════
// SLICE GENERATOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a short-term memory slice for agent context injection
 */
export async function generateShortTermMemorySlice(
  supabase: SupabaseClient,
  options: {
    lookbackHours?: number;
    maxChars?: number;
    focusCustomerId?: string;
    focusEventTypes?: string[];
  } = {}
): Promise<ShortTermMemorySlice> {
  const lookbackHours = options.lookbackHours || DEFAULT_LOOKBACK_HOURS;
  const maxChars = options.maxChars || MAX_SLICE_CHARS;
  
  const now = new Date();
  const startDate = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  
  // Fetch recent events
  const memory = await fetchUnifiedRawMemory(supabase, {
    startDate: startDate.toISOString(),
    endDate: now.toISOString()
  });

  let events = memory.events;

  // Apply focus filters if specified
  if (options.focusCustomerId) {
    events = events.filter(e => {
      const d = e.data as Record<string, unknown>;
      return d.customer_id === options.focusCustomerId ||
             d.user_id === options.focusCustomerId;
    });
  }

  if (options.focusEventTypes && options.focusEventTypes.length > 0) {
    events = events.filter(e => options.focusEventTypes!.includes(e.type));
  }

  // Sort by priority and recency
  const scoredEvents = events.map(e => ({
    event: e,
    score: (EVENT_PRIORITY[e.type] || 1) * 100 + 
           (now.getTime() - new Date(e.timestamp).getTime()) / (1000 * 60 * 60) // Hours ago
  }));
  
  scoredEvents.sort((a, b) => b.score - a.score);

  // Build summary
  const pendingOrders = events.filter(e => 
    e.type === 'order_created' && 
    ['pending', 'under_review'].includes(String((e.data as Record<string, unknown>).payment_status))
  );
  
  const pendingTickets = events.filter(e => 
    e.type === 'ticket_request' && 
    ['submitted', 'quoted'].includes(String((e.data as Record<string, unknown>).status))
  );

  const awaitingQuotes = events.filter(e =>
    e.type === 'quote_generated' &&
    ['quoted', 'pending'].includes(String((e.data as Record<string, unknown>).status))
  );

  const queuedBookings = events.filter(e =>
    e.type === 'booking_queued' &&
    ['pending', 'scheduled'].includes(String((e.data as Record<string, unknown>).status))
  );

  // Extract active customers
  const customerSet = new Set<string>();
  events.forEach(e => {
    const d = e.data as Record<string, unknown>;
    if (d.customer_name) customerSet.add(String(d.customer_name));
    else if (d.customer_email) customerSet.add(String(d.customer_email).split('@')[0]);
  });

  // Build recent events list (with token budget)
  const recentEvents: ShortTermMemorySlice['recent_events'] = [];
  let currentChars = 0;
  const reservedChars = 2000; // Reserve for summary and structure

  for (const { event } of scoredEvents) {
    const eventSummary = summarizeEvent(event);
    const eventChars = JSON.stringify(eventSummary).length;
    
    if (currentChars + eventChars > maxChars - reservedChars) break;
    
    recentEvents.push(eventSummary);
    currentChars += eventChars;
  }

  // Identify active threads (conversations/tickets still in progress)
  const activeThreads = identifyActiveThreads(events);

  const slice: ShortTermMemorySlice = {
    generated_at: now.toISOString(),
    lookback_hours: lookbackHours,
    token_budget: Math.round(maxChars / 4),
    estimated_tokens: Math.round(currentChars / 4),
    
    summary: {
      period: `Last ${lookbackHours} hours (${startDate.toISOString()} to ${now.toISOString()})`,
      total_events: memory.events.length,
      events_included: recentEvents.length,
      active_customers: Array.from(customerSet).slice(0, 20),
      pending_items: {
        orders_pending: pendingOrders.length,
        tickets_pending: pendingTickets.length,
        quotes_awaiting: awaitingQuotes.length,
        bookings_queued: queuedBookings.length,
      }
    },
    
    recent_events: recentEvents,
    active_threads: activeThreads.slice(0, 10),
  };

  return slice;
}

/**
 * Summarize a single event into a compact format
 */
function summarizeEvent(event: RawEvent): ShortTermMemorySlice['recent_events'][0] {
  const d = event.data as Record<string, unknown>;
  
  let summary = '';
  const keyData: Record<string, unknown> = { id: event.id };

  switch (event.type) {
    case 'order_created':
      summary = `Order $${d.amount_paid} via ${d.payment_method} - ${d.payment_status}`;
      keyData.amount = d.amount_paid;
      keyData.status = d.payment_status;
      keyData.customer = d.customer_email;
      break;

    case 'ticket_request':
      summary = `Ticket ${d.origin} → ${d.destination} on ${d.departure_date} - ${d.status}`;
      keyData.route = `${d.origin} → ${d.destination}`;
      keyData.status = d.status;
      keyData.price = d.quoted_price;
      keyData.customer = d.contact_email;
      break;

    case 'quote_generated':
      summary = `Quote ${d.route} $${d.quoted_price} - ${d.status}`;
      keyData.route = d.route;
      keyData.price = d.quoted_price;
      keyData.status = d.status;
      break;

    case 'call_log':
      summary = `Call to ${d.airline} - ${d.status}${d.confirmation_number ? ` ✓${d.confirmation_number}` : ''}`;
      keyData.airline = d.airline;
      keyData.status = d.status;
      keyData.confirmation = d.confirmation_number;
      keyData.duration = d.duration_seconds;
      break;

    case 'admin_alert':
      summary = `Alert: ${String(d.message).substring(0, 100)}`;
      keyData.type = d.alert_type;
      keyData.read = d.is_read;
      break;

    case 'conversation_started':
      summary = `New ${event.channel} conversation${d.customer_name ? ` with ${d.customer_name}` : ''}`;
      keyData.customer = d.customer_name || d.customer_email;
      keyData.serious = d.is_serious;
      break;

    case 'chat_message':
      const content = String(d.content || '').substring(0, 80);
      summary = `[${d.role}] ${content}${String(d.content || '').length > 80 ? '...' : ''}`;
      keyData.role = d.role;
      break;

    case 'booking_queued':
      summary = `Booking queued: ${d.booking_method} - ${d.status}`;
      keyData.method = d.booking_method;
      keyData.status = d.status;
      keyData.priority = d.priority;
      break;

    case 'marketplace_listing':
      summary = `Listing: ${d.title} - ${d.status}`;
      keyData.title = d.title;
      keyData.status = d.status;
      keyData.deadline = d.deadline;
      break;

    case 'bid_placed':
      summary = `Bid $${d.amount} on listing - ${d.status}`;
      keyData.amount = d.amount;
      keyData.status = d.status;
      break;

    default:
      summary = `${event.type}`;
      keyData.raw = d;
  }

  return {
    timestamp: event.timestamp,
    type: event.type,
    channel: event.channel,
    summary,
    key_data: keyData
  };
}

/**
 * Identify active threads that need attention
 */
function identifyActiveThreads(events: RawEvent[]): ShortTermMemorySlice['active_threads'] {
  const threads: ShortTermMemorySlice['active_threads'] = [];
  
  // Group by conversation/ticket/order
  const conversationMap = new Map<string, RawEvent[]>();
  const ticketMap = new Map<string, RawEvent>();
  const orderMap = new Map<string, RawEvent>();

  events.forEach(e => {
    const d = e.data as Record<string, unknown>;
    
    if (e.type === 'conversation_started' || e.type === 'chat_message') {
      const convId = String(d.conversation_id || d.id);
      if (!conversationMap.has(convId)) conversationMap.set(convId, []);
      conversationMap.get(convId)!.push(e);
    }
    
    if (e.type === 'ticket_request') {
      ticketMap.set(String(d.id), e);
    }
    
    if (e.type === 'order_created') {
      orderMap.set(String(d.id), e);
    }
  });

  // Add pending tickets as threads
  ticketMap.forEach((e, id) => {
    const d = e.data as Record<string, unknown>;
    const status = String(d.status);
    if (['submitted', 'quoted', 'processing'].includes(status)) {
      threads.push({
        id,
        type: 'ticket_request',
        status,
        last_activity: e.timestamp,
        context: `${d.origin} → ${d.destination} | ${d.contact_email}`
      });
    }
  });

  // Add pending orders as threads
  orderMap.forEach((e, id) => {
    const d = e.data as Record<string, unknown>;
    const status = String(d.payment_status);
    if (['pending', 'under_review'].includes(status)) {
      threads.push({
        id,
        type: 'order',
        status,
        last_activity: e.timestamp,
        context: `$${d.amount_paid} via ${d.payment_method} | ${d.customer_email}`
      });
    }
  });

  // Sort by last activity
  threads.sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());

  return threads;
}

/**
 * Format short-term memory as injectable context string
 */
export function formatShortTermMemoryForContext(slice: ShortTermMemorySlice): string {
  const lines: string[] = [];

  lines.push(`═══ SHORT-TERM MEMORY (${slice.lookback_hours}h) ═══`);
  lines.push(`Generated: ${slice.generated_at}`);
  lines.push(`Events: ${slice.summary.events_included}/${slice.summary.total_events} included`);
  lines.push('');

  lines.push('📊 PENDING ITEMS:');
  lines.push(`  Orders: ${slice.summary.pending_items.orders_pending}`);
  lines.push(`  Tickets: ${slice.summary.pending_items.tickets_pending}`);
  lines.push(`  Quotes: ${slice.summary.pending_items.quotes_awaiting}`);
  lines.push(`  Bookings: ${slice.summary.pending_items.bookings_queued}`);
  lines.push('');

  if (slice.active_threads.length > 0) {
    lines.push('🔄 ACTIVE THREADS:');
    slice.active_threads.forEach(t => {
      lines.push(`  [${t.type}] ${t.id.substring(0, 8)} - ${t.status}: ${t.context}`);
    });
    lines.push('');
  }

  lines.push('📝 RECENT EVENTS:');
  slice.recent_events.slice(0, 30).forEach(e => {
    const time = new Date(e.timestamp).toLocaleTimeString();
    lines.push(`  ${time} [${e.type}] ${e.summary}`);
  });

  lines.push('');
  lines.push('═══ END SHORT-TERM MEMORY ═══');

  return lines.join('\n');
}
