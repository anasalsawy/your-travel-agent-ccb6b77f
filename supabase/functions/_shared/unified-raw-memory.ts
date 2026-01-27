/**
 * UNIFIED RAW MEMORY - SOURCE OF TRUTH
 * 
 * This is the single source of truth for all business events.
 * - Full JSON events
 * - Chronological order
 * - No truncation except hard technical limits
 * - No lossy summarization
 * 
 * The Memory Agent uses this to:
 * 1. Generate Knowledge Base background files
 * 2. Create short-term context slices
 * 3. Answer precision memory queries
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface RawEvent {
  id: string;
  timestamp: string;
  type: string;
  channel?: string;
  data: Record<string, unknown>;
}

export interface UnifiedMemoryStore {
  events: RawEvent[];
  metadata: {
    fetched_at: string;
    period_start: string;
    period_end: string;
    total_events: number;
    event_types: Record<string, number>;
  };
}

// ═══════════════════════════════════════════════════════════════════
// CORE FETCH FUNCTION - GETS ALL RAW EVENTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch ALL events from the unified memory store.
 * This is the authoritative source - no summarization, no filtering.
 */
export async function fetchUnifiedRawMemory(
  supabase: SupabaseClient,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<UnifiedMemoryStore> {
  const now = new Date();
  const endDate = options.endDate || now.toISOString();
  const startDate = options.startDate || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const allEvents: RawEvent[] = [];
  const eventTypeCounts: Record<string, number> = {};

  // Helper to add events and track types
  const addEvents = (events: RawEvent[]) => {
    events.forEach(e => {
      allEvents.push(e);
      eventTypeCounts[e.type] = (eventTypeCounts[e.type] || 0) + 1;
    });
  };

  // ═══════════════════════════════════════════════════════════════════
  // FETCH ALL DATA SOURCES IN PARALLEL
  // ═══════════════════════════════════════════════════════════════════

  const [
    conversations,
    messages,
    quotes,
    orders,
    tickets,
    calls,
    notifications,
    alerts,
    bookings,
    reviews,
    listings,
    bids
  ] = await Promise.all([
    supabase.from("ai_conversations").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("ai_chat_messages").select("*, ai_conversations(session_id)").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("quote_logs").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("orders").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("ticket_requests").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("call_logs").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("notification_log").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("admin_alerts").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("booking_queue").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("maya_conversation_reviews").select("*").gte("reviewed_at", startDate).lte("reviewed_at", endDate).order("reviewed_at", { ascending: true }),
    supabase.from("marketplace_listings").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
    supabase.from("bids").select("*").gte("created_at", startDate).lte("created_at", endDate).order("created_at", { ascending: true }),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // TRANSFORM TO UNIFIED EVENT FORMAT
  // ═══════════════════════════════════════════════════════════════════

  // Conversations
  (conversations.data || []).forEach(c => {
    const channel = c.session_id?.startsWith('whatsapp-') ? 'whatsapp'
      : c.session_id?.startsWith('el-') || c.session_id?.startsWith('elevenlabs-') ? 'voice'
      : 'web';
    addEvents([{
      id: c.id,
      timestamp: c.created_at,
      type: 'conversation_started',
      channel,
      data: { ...c }
    }]);
  });

  // Messages
  (messages.data || []).forEach(m => {
    const sessionId = (m.ai_conversations as { session_id?: string })?.session_id || '';
    const channel = sessionId.startsWith('whatsapp-') ? 'whatsapp'
      : sessionId.startsWith('el-') || sessionId.startsWith('elevenlabs-') ? 'voice'
      : 'web';
    addEvents([{
      id: m.id,
      timestamp: m.created_at,
      type: 'chat_message',
      channel,
      data: { ...m, ai_conversations: undefined }
    }]);
  });

  // Quotes
  (quotes.data || []).forEach(q => {
    addEvents([{
      id: q.id,
      timestamp: q.created_at,
      type: 'quote_generated',
      data: { ...q }
    }]);
  });

  // Orders
  (orders.data || []).forEach(o => {
    addEvents([{
      id: o.id,
      timestamp: o.created_at,
      type: 'order_created',
      data: { ...o }
    }]);
  });

  // Ticket Requests
  (tickets.data || []).forEach(t => {
    addEvents([{
      id: t.id,
      timestamp: t.created_at,
      type: 'ticket_request',
      data: { ...t }
    }]);
  });

  // Call Logs
  (calls.data || []).forEach(c => {
    addEvents([{
      id: c.id,
      timestamp: c.created_at,
      type: 'call_log',
      data: { ...c }
    }]);
  });

  // Notifications
  (notifications.data || []).forEach(n => {
    addEvents([{
      id: n.id,
      timestamp: n.created_at,
      type: 'notification_sent',
      data: { ...n }
    }]);
  });

  // Admin Alerts
  (alerts.data || []).forEach(a => {
    addEvents([{
      id: a.id,
      timestamp: a.created_at,
      type: 'admin_alert',
      data: { ...a }
    }]);
  });

  // Booking Queue
  (bookings.data || []).forEach(b => {
    addEvents([{
      id: b.id,
      timestamp: b.created_at,
      type: 'booking_queued',
      data: { ...b }
    }]);
  });

  // Conversation Reviews
  (reviews.data || []).forEach(r => {
    addEvents([{
      id: r.id,
      timestamp: r.reviewed_at,
      type: 'conversation_review',
      data: { ...r }
    }]);
  });

  // Marketplace Listings
  (listings.data || []).forEach(l => {
    addEvents([{
      id: l.id,
      timestamp: l.created_at,
      type: 'marketplace_listing',
      data: { ...l }
    }]);
  });

  // Bids
  (bids.data || []).forEach(b => {
    addEvents([{
      id: b.id,
      timestamp: b.created_at,
      type: 'bid_placed',
      data: { ...b }
    }]);
  });

  // Sort chronologically
  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Apply limit if specified
  const finalEvents = options.limit ? allEvents.slice(-options.limit) : allEvents;

  return {
    events: finalEvents,
    metadata: {
      fetched_at: now.toISOString(),
      period_start: startDate,
      period_end: endDate,
      total_events: finalEvents.length,
      event_types: eventTypeCounts,
    }
  };
}

/**
 * Utility to create a Supabase client for memory operations
 */
export function createMemoryClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}
