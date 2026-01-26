/**
 * UNIFIED ACTIVITY MEMORY SYSTEM - RAW EVENT LOG
 * 
 * Fetches ALL business activity events and creates a complete chronological log.
 * NOTHING is summarized or omitted - every single event is captured.
 * 
 * This gives all agents complete awareness of everything happening in the business.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RawActivityLog {
  events: RawEvent[];
  period: {
    start: string;
    end: string;
    days: number;
  };
}

export interface RawEvent {
  timestamp: string;
  type: string;
  channel?: string;
  data: Record<string, unknown>;
}

/**
 * Fetch ALL activity events for a given time period - NO AGGREGATION, NO OMISSIONS
 */
export async function fetchAllActivityEvents(
  supabaseUrl: string,
  supabaseKey: string,
  daysBack: number = 14
): Promise<RawActivityLog> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString();
  const nowISO = new Date().toISOString();

  const allEvents: RawEvent[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // FETCH ALL RAW DATA - NO LIMITS, NO AGGREGATION
  // ═══════════════════════════════════════════════════════════════════

  // 1. ALL Conversations
  const { data: conversations } = await supabase
    .from("ai_conversations")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (conversations || []).forEach(c => {
    const channel = c.session_id?.startsWith('whatsapp-') ? 'whatsapp' 
      : c.session_id?.startsWith('el-') || c.session_id?.startsWith('elevenlabs-') ? 'voice' 
      : 'web';
    allEvents.push({
      timestamp: c.created_at,
      type: 'conversation_started',
      channel,
      data: {
        id: c.id,
        session_id: c.session_id,
        customer_name: c.customer_name,
        customer_email: c.customer_email,
        customer_phone: c.customer_phone,
        status: c.status,
        is_serious: c.is_serious,
        needs_admin_attention: c.needs_admin_attention,
        owner_verified: c.owner_verified,
      }
    });
  });

  // 2. ALL Chat Messages
  const { data: messages } = await supabase
    .from("ai_chat_messages")
    .select("*, ai_conversations(session_id)")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (messages || []).forEach(m => {
    const sessionId = (m.ai_conversations as { session_id?: string })?.session_id || '';
    const channel = sessionId.startsWith('whatsapp-') ? 'whatsapp' 
      : sessionId.startsWith('el-') || sessionId.startsWith('elevenlabs-') ? 'voice' 
      : 'web';
    allEvents.push({
      timestamp: m.created_at,
      type: 'chat_message',
      channel,
      data: {
        id: m.id,
        conversation_id: m.conversation_id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }
    });
  });

  // 3. ALL Quotes
  const { data: quotes } = await supabase
    .from("quote_logs")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (quotes || []).forEach(q => {
    allEvents.push({
      timestamp: q.created_at,
      type: 'quote_generated',
      data: {
        id: q.id,
        route: q.route,
        travel_dates: q.travel_dates,
        passengers: q.passengers,
        market_price: q.market_price,
        quoted_price: q.quoted_price,
        discount_applied: q.discount_applied,
        status: q.status,
        customer_name: q.customer_name,
        customer_email: q.customer_email,
        customer_phone: q.customer_phone,
        booking_method: q.booking_method,
        inventory_type: q.inventory_type,
        inventory_id: q.inventory_id,
        alaska_available: q.alaska_available,
        auto_approved: q.auto_approved,
        payment_method: q.payment_method,
        conversation_id: q.conversation_id,
        admin_notes: q.admin_notes,
      }
    });
  });

  // 4. ALL Orders
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (orders || []).forEach(o => {
    allEvents.push({
      timestamp: o.created_at,
      type: 'order_created',
      data: {
        id: o.id,
        amount_paid: o.amount_paid,
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        order_status: o.order_status,
        customer_email: o.customer_email,
        voucher_id: o.voucher_id,
        delivery_status: o.delivery_status,
        delivery_info: o.delivery_info,
        admin_notes: o.admin_notes,
        btc_address: o.btc_address,
        btc_amount: o.btc_amount,
        proof_upload_url: o.proof_upload_url,
      }
    });
  });

  // 5. ALL Ticket Requests
  const { data: tickets } = await supabase
    .from("ticket_requests")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (tickets || []).forEach(t => {
    allEvents.push({
      timestamp: t.created_at,
      type: 'ticket_request',
      data: {
        id: t.id,
        origin: t.origin,
        destination: t.destination,
        departure_date: t.departure_date,
        return_date: t.return_date,
        trip_type: t.trip_type,
        passengers: t.passengers,
        cabin_class: t.cabin_class,
        preferred_airline: t.preferred_airline,
        budget: t.budget,
        flexibility: t.flexibility,
        status: t.status,
        quoted_price: t.quoted_price,
        payment_status: t.payment_status,
        payment_method: t.payment_method,
        payment_plan: t.payment_plan,
        deposit_status: t.deposit_status,
        balance_status: t.balance_status,
        contact_email: t.contact_email,
        contact_phone: t.contact_phone,
        special_notes: t.special_notes,
        admin_notes: t.admin_notes,
        issued_ticket_info: t.issued_ticket_info,
        is_public: t.is_public,
      }
    });
  });

  // 6. ALL Call Logs
  const { data: calls } = await supabase
    .from("call_logs")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (calls || []).forEach(c => {
    allEvents.push({
      timestamp: c.created_at,
      type: 'call_log',
      data: {
        id: c.id,
        airline: c.airline,
        phone_number: c.phone_number,
        call_type: c.call_type,
        status: c.status,
        call_sid: c.call_sid,
        conversation_id: c.conversation_id,
        started_at: c.started_at,
        answered_at: c.answered_at,
        ended_at: c.ended_at,
        duration_seconds: c.duration_seconds,
        confirmation_number: c.confirmation_number,
        passenger_names: c.passenger_names,
        booked_price: c.booked_price,
        booked_flight_info: c.booked_flight_info,
        transcript: c.transcript,
        call_summary: c.call_summary,
        customer_email: c.customer_email,
        customer_phone: c.customer_phone,
        admin_notes: c.admin_notes,
        ticket_request_id: c.ticket_request_id,
      }
    });
  });

  // 7. ALL Notifications
  const { data: notifications } = await supabase
    .from("notification_log")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (notifications || []).forEach(n => {
    allEvents.push({
      timestamp: n.created_at,
      type: 'notification_sent',
      data: {
        id: n.id,
        event_type: n.event_type,
        recipient: n.recipient,
        status: n.status,
        record_id: n.record_id,
        payload: n.payload,
        error: n.error,
      }
    });
  });

  // 8. ALL Admin Alerts
  const { data: alerts } = await supabase
    .from("admin_alerts")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (alerts || []).forEach(a => {
    allEvents.push({
      timestamp: a.created_at,
      type: 'admin_alert',
      data: {
        id: a.id,
        alert_type: a.alert_type,
        message: a.message,
        conversation_id: a.conversation_id,
        customer_context: a.customer_context,
        discount_requested: a.discount_requested,
        is_read: a.is_read,
        admin_response: a.admin_response,
        responded_at: a.responded_at,
      }
    });
  });

  // 9. ALL Booking Queue entries
  const { data: bookings } = await supabase
    .from("booking_queue")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (bookings || []).forEach(b => {
    allEvents.push({
      timestamp: b.created_at,
      type: 'booking_queued',
      data: {
        id: b.id,
        status: b.status,
        booking_method: b.booking_method,
        inventory_type: b.inventory_type,
        inventory_id: b.inventory_id,
        quote_id: b.quote_id,
        ticket_request_id: b.ticket_request_id,
        priority: b.priority,
        scheduled_at: b.scheduled_at,
        started_at: b.started_at,
        completed_at: b.completed_at,
        call_log_id: b.call_log_id,
        booking_result: b.booking_result,
        retry_count: b.retry_count,
        error_message: b.error_message,
      }
    });
  });

  // 10. ALL Maya Conversation Reviews
  const { data: reviews } = await supabase
    .from("maya_conversation_reviews")
    .select("*")
    .gte("reviewed_at", cutoffISO)
    .order("reviewed_at", { ascending: true });

  (reviews || []).forEach(r => {
    allEvents.push({
      timestamp: r.reviewed_at,
      type: 'conversation_review',
      data: {
        id: r.id,
        conversation_id: r.conversation_id,
        call_log_id: r.call_log_id,
        channel: r.channel,
        outcome: r.outcome,
        outcome_value: r.outcome_value,
        overall_score: r.overall_score,
        rapport_score: r.rapport_score,
        objection_handling_score: r.objection_handling_score,
        closing_score: r.closing_score,
        product_knowledge_score: r.product_knowledge_score,
        strengths: r.strengths,
        weaknesses: r.weaknesses,
        suggestions: r.suggestions,
        best_moment: r.best_moment,
        worst_moment: r.worst_moment,
        missed_opportunity: r.missed_opportunity,
        tags: r.tags,
        transcript_snippet: r.transcript_snippet,
        customer_id: r.customer_id,
        customer_preferences_learned: r.customer_preferences_learned,
      }
    });
  });

  // 11. ALL Marketplace Listings
  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (listings || []).forEach(l => {
    allEvents.push({
      timestamp: l.created_at,
      type: 'marketplace_listing',
      data: {
        id: l.id,
        title: l.title,
        ticket_request_id: l.ticket_request_id,
        user_id: l.user_id,
        status: l.status,
        deadline: l.deadline,
        travel_date: l.travel_date,
        min_bid: l.min_bid,
        winning_bid_id: l.winning_bid_id,
        escrow_status: l.escrow_status,
        escrow_notes: l.escrow_notes,
        sparefare_listing_url: l.sparefare_listing_url,
        buyer_notified_at: l.buyer_notified_at,
        seller_notified_at: l.seller_notified_at,
        completed_at: l.completed_at,
      }
    });
  });

  // 12. ALL Bids
  const { data: bids } = await supabase
    .from("bids")
    .select("*")
    .gte("created_at", cutoffISO)
    .order("created_at", { ascending: true });

  (bids || []).forEach(b => {
    allEvents.push({
      timestamp: b.created_at,
      type: 'bid_placed',
      data: {
        id: b.id,
        listing_id: b.listing_id,
        seller_id: b.seller_id,
        amount: b.amount,
        status: b.status,
        message: b.message,
        conditions: b.conditions,
        estimated_delivery: b.estimated_delivery,
        payment_method: b.payment_method,
        payment_proof_url: b.payment_proof_url,
        payment_verified_at: b.payment_verified_at,
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SORT ALL EVENTS CHRONOLOGICALLY
  // ═══════════════════════════════════════════════════════════════════
  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    events: allEvents,
    period: {
      start: cutoffISO.split('T')[0],
      end: nowISO.split('T')[0],
      days: daysBack,
    },
  };
}

/**
 * Format ALL events into a complete chronological log - TRUE RAW DATA, NOTHING OMITTED
 * Every single field, every single value, no truncation, no formatting
 */
export function formatRawActivityLog(log: RawActivityLog): string {
  const lines: string[] = [];

  lines.push(`
═══════════════════════════════════════════════════════════════════
📊 RAW BUSINESS ACTIVITY LOG (${log.period.start} to ${log.period.end})
═══════════════════════════════════════════════════════════════════
Total Events: ${log.events.length}
`);

  // Group by date for readability
  const eventsByDate = new Map<string, RawEvent[]>();
  log.events.forEach(event => {
    const date = event.timestamp.split('T')[0];
    if (!eventsByDate.has(date)) {
      eventsByDate.set(date, []);
    }
    eventsByDate.get(date)!.push(event);
  });

  // Output each day's events - FULL RAW JSON, NO TRUNCATION
  for (const [date, events] of eventsByDate) {
    lines.push(`\n━━━ ${date} (${events.length} events) ━━━`);
    
    events.forEach(event => {
      // Output the COMPLETE event as raw JSON - every field, every value
      lines.push(JSON.stringify(event));
    });
  }

  return lines.join('\n');
}

/**
 * Get complete memory context for agent injection - ALL EVENTS, NOTHING OMITTED
 */
export async function getAgentMemoryContext(
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ shortTerm: string; longTerm: string }> {
  const [shortTermLog, longTermLog] = await Promise.all([
    fetchAllActivityEvents(supabaseUrl, supabaseKey, 14), // 2 weeks
    fetchAllActivityEvents(supabaseUrl, supabaseKey, 90), // 90 days
  ]);

  return {
    shortTerm: formatRawActivityLog(shortTermLog),
    longTerm: formatRawActivityLog(longTermLog),
  };
}

// Legacy exports for backward compatibility
export interface ActivitySummary {
  conversations: { total: number; web: number; whatsapp: number; voice: number; recent_topics: string[]; active_customers: string[] };
  quotes: { total: number; pending: number; accepted: number; declined: number; total_value: number; avg_quote_value: number; popular_routes: string[] };
  orders: { total: number; pending_payment: number; completed: number; total_revenue: number };
  tickets: { total: number; by_status: Record<string, number>; popular_destinations: string[] };
  calls: { total: number; completed: number; avg_duration_seconds: number; bookings_confirmed: number };
  notifications: { total: number; by_type: Record<string, number> };
  key_events: string[];
  period: { start: string; end: string; days: number };
}

export async function fetchActivitySummary(
  supabaseUrl: string,
  supabaseKey: string,
  daysBack: number = 14
): Promise<ActivitySummary> {
  // Use the new raw fetch and derive summary for backward compatibility
  const log = await fetchAllActivityEvents(supabaseUrl, supabaseKey, daysBack);
  
  const conversations = log.events.filter(e => e.type === 'conversation_started');
  const quotes = log.events.filter(e => e.type === 'quote_generated');
  const orders = log.events.filter(e => e.type === 'order_created');
  const tickets = log.events.filter(e => e.type === 'ticket_request');
  const calls = log.events.filter(e => e.type === 'call_log');
  const notifications = log.events.filter(e => e.type === 'notification_sent');

  return {
    conversations: {
      total: conversations.length,
      web: conversations.filter(c => c.channel === 'web').length,
      whatsapp: conversations.filter(c => c.channel === 'whatsapp').length,
      voice: conversations.filter(c => c.channel === 'voice').length,
      recent_topics: [],
      active_customers: [...new Set(conversations.map(c => String(c.data.customer_name || c.data.customer_email)).filter(Boolean))].slice(0, 20),
    },
    quotes: {
      total: quotes.length,
      pending: quotes.filter(q => q.data.status === 'quoted' || q.data.status === 'pending').length,
      accepted: quotes.filter(q => q.data.status === 'accepted' || q.data.status === 'paid').length,
      declined: quotes.filter(q => q.data.status === 'declined' || q.data.status === 'expired').length,
      total_value: quotes.reduce((sum, q) => sum + (Number(q.data.quoted_price) || 0), 0),
      avg_quote_value: quotes.length > 0 ? quotes.reduce((sum, q) => sum + (Number(q.data.quoted_price) || 0), 0) / quotes.length : 0,
      popular_routes: [...new Set(quotes.map(q => String(q.data.route)).filter(Boolean))].slice(0, 10),
    },
    orders: {
      total: orders.length,
      pending_payment: orders.filter(o => o.data.payment_status === 'pending' || o.data.payment_status === 'under_review').length,
      completed: orders.filter(o => o.data.payment_status === 'completed').length,
      total_revenue: orders.filter(o => o.data.payment_status === 'completed').reduce((sum, o) => sum + (Number(o.data.amount_paid) || 0), 0),
    },
    tickets: {
      total: tickets.length,
      by_status: tickets.reduce((acc, t) => {
        const status = String(t.data.status) || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      popular_destinations: [...new Set(tickets.map(t => String(t.data.destination)).filter(Boolean))].slice(0, 10),
    },
    calls: {
      total: calls.length,
      completed: calls.filter(c => c.data.status === 'completed').length,
      avg_duration_seconds: calls.length > 0 ? Math.round(calls.reduce((sum, c) => sum + (Number(c.data.duration_seconds) || 0), 0) / calls.length) : 0,
      bookings_confirmed: calls.filter(c => c.data.confirmation_number).length,
    },
    notifications: {
      total: notifications.length,
      by_type: notifications.reduce((acc, n) => {
        const type = String(n.data.event_type);
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    key_events: [],
    period: log.period,
  };
}

export function formatActivityMemoryPrompt(summary: ActivitySummary): string {
  // For backward compatibility, call the new raw format
  return `[Legacy summary - use raw log for complete data]
Conversations: ${summary.conversations.total} | Quotes: ${summary.quotes.total} ($${summary.quotes.total_value}) | Orders: ${summary.orders.total} ($${summary.orders.total_revenue})`;
}

export async function fetchDetailedActivityLog(
  supabaseUrl: string,
  supabaseKey: string,
  daysBack: number = 90
): Promise<string> {
  const log = await fetchAllActivityEvents(supabaseUrl, supabaseKey, daysBack);
  return formatRawActivityLog(log);
}
