/**
 * UNIFIED ACTIVITY MEMORY SYSTEM
 * 
 * Fetches all business activity logs and creates:
 * 1. SHORT-TERM MEMORY: Last 2 weeks of activity (injected into system prompts)
 * 2. LONG-TERM MEMORY: All historical data summary (available for context)
 * 
 * This gives all agents holistic awareness of everything happening in the business.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ActivitySummary {
  // Conversation activity
  conversations: {
    total: number;
    web: number;
    whatsapp: number;
    voice: number;
    recent_topics: string[];
    active_customers: string[];
  };
  
  // Quote activity
  quotes: {
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    total_value: number;
    avg_quote_value: number;
    popular_routes: string[];
  };
  
  // Order activity
  orders: {
    total: number;
    pending_payment: number;
    completed: number;
    total_revenue: number;
  };
  
  // Ticket requests
  tickets: {
    total: number;
    by_status: Record<string, number>;
    popular_destinations: string[];
  };
  
  // Voice calls
  calls: {
    total: number;
    completed: number;
    avg_duration_seconds: number;
    bookings_confirmed: number;
  };
  
  // Notifications sent
  notifications: {
    total: number;
    by_type: Record<string, number>;
  };
  
  // Key events (notable happenings)
  key_events: string[];
  
  // Time range
  period: {
    start: string;
    end: string;
    days: number;
  };
}

/**
 * Fetch comprehensive activity summary for a given time period
 */
export async function fetchActivitySummary(
  supabaseUrl: string,
  supabaseKey: string,
  daysBack: number = 14
): Promise<ActivitySummary> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString();
  const nowISO = new Date().toISOString();

  // Parallel fetch all data sources
  const [
    conversationsResult,
    messagesResult,
    quotesResult,
    ordersResult,
    ticketsResult,
    callsResult,
    notificationsResult,
  ] = await Promise.all([
    // Conversations
    supabase
      .from("ai_conversations")
      .select("id, session_id, customer_name, customer_email, status, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
    
    // Recent messages for topic extraction
    supabase
      .from("ai_chat_messages")
      .select("content, role, created_at, conversation_id")
      .gte("created_at", cutoffISO)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(100),
    
    // Quotes
    supabase
      .from("quote_logs")
      .select("id, route, quoted_price, market_price, status, customer_name, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
    
    // Orders
    supabase
      .from("orders")
      .select("id, amount_paid, payment_status, order_status, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
    
    // Ticket requests
    supabase
      .from("ticket_requests")
      .select("id, origin, destination, status, quoted_price, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
    
    // Call logs
    supabase
      .from("call_logs")
      .select("id, status, duration_seconds, confirmation_number, call_summary, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
    
    // Notifications
    supabase
      .from("notification_log")
      .select("id, event_type, status, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false }),
  ]);

  // Process conversations
  const conversations = conversationsResult.data || [];
  const webConvos = conversations.filter(c => !c.session_id?.startsWith('whatsapp-') && !c.session_id?.startsWith('el-'));
  const whatsappConvos = conversations.filter(c => c.session_id?.startsWith('whatsapp-'));
  const voiceConvos = conversations.filter(c => c.session_id?.startsWith('el-') || c.session_id?.startsWith('elevenlabs-'));
  const activeCustomers = [...new Set(conversations.map(c => c.customer_name || c.customer_email).filter(Boolean))].slice(0, 20);

  // Extract recent topics from messages
  const messages = messagesResult.data || [];
  const recentTopics = extractTopics(messages.map(m => m.content).slice(0, 50));

  // Process quotes
  const quotes = quotesResult.data || [];
  const quotesByStatus = {
    pending: quotes.filter(q => q.status === 'quoted' || q.status === 'pending').length,
    accepted: quotes.filter(q => q.status === 'accepted' || q.status === 'paid').length,
    declined: quotes.filter(q => q.status === 'declined' || q.status === 'expired').length,
  };
  const totalQuoteValue = quotes.reduce((sum, q) => sum + (q.quoted_price || 0), 0);
  const popularRoutes = extractPopularItems(quotes.map(q => q.route).filter(Boolean));

  // Process orders
  const orders = ordersResult.data || [];
  const pendingPayments = orders.filter(o => o.payment_status === 'pending' || o.payment_status === 'under_review').length;
  const completedOrders = orders.filter(o => o.payment_status === 'completed').length;
  const totalRevenue = orders
    .filter(o => o.payment_status === 'completed')
    .reduce((sum, o) => sum + (o.amount_paid || 0), 0);

  // Process tickets
  const tickets = ticketsResult.data || [];
  const ticketsByStatus: Record<string, number> = {};
  tickets.forEach(t => {
    const status = t.status || 'unknown';
    ticketsByStatus[status] = (ticketsByStatus[status] || 0) + 1;
  });
  const popularDestinations = extractPopularItems(tickets.map(t => t.destination).filter(Boolean));

  // Process calls
  const calls = callsResult.data || [];
  const completedCalls = calls.filter(c => c.status === 'completed');
  const avgDuration = completedCalls.length > 0 
    ? completedCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / completedCalls.length 
    : 0;
  const bookingsConfirmed = calls.filter(c => c.confirmation_number).length;

  // Process notifications
  const notifications = notificationsResult.data || [];
  const notifByType: Record<string, number> = {};
  notifications.forEach(n => {
    notifByType[n.event_type] = (notifByType[n.event_type] || 0) + 1;
  });

  // Generate key events
  const keyEvents = generateKeyEvents(quotes, orders, tickets, calls);

  return {
    conversations: {
      total: conversations.length,
      web: webConvos.length,
      whatsapp: whatsappConvos.length,
      voice: voiceConvos.length,
      recent_topics: recentTopics,
      active_customers: activeCustomers as string[],
    },
    quotes: {
      total: quotes.length,
      pending: quotesByStatus.pending,
      accepted: quotesByStatus.accepted,
      declined: quotesByStatus.declined,
      total_value: totalQuoteValue,
      avg_quote_value: quotes.length > 0 ? totalQuoteValue / quotes.length : 0,
      popular_routes: popularRoutes,
    },
    orders: {
      total: orders.length,
      pending_payment: pendingPayments,
      completed: completedOrders,
      total_revenue: totalRevenue,
    },
    tickets: {
      total: tickets.length,
      by_status: ticketsByStatus,
      popular_destinations: popularDestinations,
    },
    calls: {
      total: calls.length,
      completed: completedCalls.length,
      avg_duration_seconds: Math.round(avgDuration),
      bookings_confirmed: bookingsConfirmed,
    },
    notifications: {
      total: notifications.length,
      by_type: notifByType,
    },
    key_events: keyEvents,
    period: {
      start: cutoffISO.split('T')[0],
      end: nowISO.split('T')[0],
      days: daysBack,
    },
  };
}

/**
 * Format activity summary into a prompt section
 */
export function formatActivityMemoryPrompt(summary: ActivitySummary): string {
  const sections: string[] = [];

  sections.push(`
═══════════════════════════════════════════════════════════════════
📊 REAL-TIME BUSINESS AWARENESS (Last ${summary.period.days} days: ${summary.period.start} to ${summary.period.end})
═══════════════════════════════════════════════════════════════════

💬 CONVERSATIONS:
  • Total: ${summary.conversations.total} (Web: ${summary.conversations.web} | WhatsApp: ${summary.conversations.whatsapp} | Voice: ${summary.conversations.voice})
  ${summary.conversations.active_customers.length > 0 ? `• Active Customers: ${summary.conversations.active_customers.slice(0, 10).join(', ')}` : ''}
  ${summary.conversations.recent_topics.length > 0 ? `• Recent Topics: ${summary.conversations.recent_topics.join(', ')}` : ''}

💵 QUOTES:
  • Total: ${summary.quotes.total} | Pending: ${summary.quotes.pending} | Accepted: ${summary.quotes.accepted} | Declined: ${summary.quotes.declined}
  • Total Value: $${summary.quotes.total_value.toLocaleString()} | Avg: $${Math.round(summary.quotes.avg_quote_value).toLocaleString()}
  ${summary.quotes.popular_routes.length > 0 ? `• Popular Routes: ${summary.quotes.popular_routes.join(', ')}` : ''}

🛒 ORDERS:
  • Total: ${summary.orders.total} | Pending Payment: ${summary.orders.pending_payment} | Completed: ${summary.orders.completed}
  • Revenue: $${summary.orders.total_revenue.toLocaleString()}

✈️ TICKET REQUESTS:
  • Total: ${summary.tickets.total}
  ${Object.keys(summary.tickets.by_status).length > 0 ? `• By Status: ${Object.entries(summary.tickets.by_status).map(([k, v]) => `${k}: ${v}`).join(' | ')}` : ''}
  ${summary.tickets.popular_destinations.length > 0 ? `• Popular Destinations: ${summary.tickets.popular_destinations.join(', ')}` : ''}

📞 VOICE CALLS:
  • Total: ${summary.calls.total} | Completed: ${summary.calls.completed}
  • Avg Duration: ${Math.round(summary.calls.avg_duration_seconds / 60)} min | Bookings Confirmed: ${summary.calls.bookings_confirmed}

📧 NOTIFICATIONS SENT:
  • Total: ${summary.notifications.total}
  ${Object.keys(summary.notifications.by_type).length > 0 ? `• By Type: ${Object.entries(summary.notifications.by_type).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(' | ')}` : ''}
`.trim());

  if (summary.key_events.length > 0) {
    sections.push(`
⚡ KEY EVENTS:
${summary.key_events.map(e => `  • ${e}`).join('\n')}
`.trim());
  }

  return sections.join('\n\n');
}

/**
 * Get recent detailed activity log (for long-term context)
 */
export async function fetchDetailedActivityLog(
  supabaseUrl: string,
  supabaseKey: string,
  daysBack: number = 90
): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffISO = cutoffDate.toISOString();

  // Fetch more detailed data for long-term memory
  const [quotesResult, ordersResult, callsResult, reviewsResult] = await Promise.all([
    supabase
      .from("quote_logs")
      .select("route, quoted_price, status, customer_name, customer_email, booking_method, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false })
      .limit(200),
    
    supabase
      .from("orders")
      .select("amount_paid, payment_method, payment_status, order_status, customer_email, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false })
      .limit(100),
    
    supabase
      .from("call_logs")
      .select("airline, status, confirmation_number, call_summary, booked_price, created_at")
      .gte("created_at", cutoffISO)
      .order("created_at", { ascending: false })
      .limit(100),
    
    supabase
      .from("maya_conversation_reviews")
      .select("overall_score, outcome, strengths, weaknesses, suggestions, reviewed_at")
      .gte("reviewed_at", cutoffISO)
      .order("reviewed_at", { ascending: false })
      .limit(50),
  ]);

  const quotes = quotesResult.data || [];
  const orders = ordersResult.data || [];
  const calls = callsResult.data || [];
  const reviews = reviewsResult.data || [];

  // Build detailed log
  let log = `
═══════════════════════════════════════════════════════════════════
📚 LONG-TERM BUSINESS MEMORY (Last ${daysBack} days)
═══════════════════════════════════════════════════════════════════

`;

  // Aggregate patterns
  const routeFrequency: Record<string, number> = {};
  const statusFrequency: Record<string, number> = {};
  const bookingMethodFrequency: Record<string, number> = {};
  
  quotes.forEach(q => {
    if (q.route) routeFrequency[q.route] = (routeFrequency[q.route] || 0) + 1;
    if (q.status) statusFrequency[q.status] = (statusFrequency[q.status] || 0) + 1;
    if (q.booking_method) bookingMethodFrequency[q.booking_method] = (bookingMethodFrequency[q.booking_method] || 0) + 1;
  });

  log += `📈 QUOTE PATTERNS:\n`;
  log += `  • Total Quotes: ${quotes.length}\n`;
  log += `  • Top Routes: ${Object.entries(routeFrequency).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, c]) => `${r} (${c})`).join(', ')}\n`;
  log += `  • Conversion: ${Object.entries(statusFrequency).map(([s, c]) => `${s}: ${c}`).join(' | ')}\n`;
  log += `  • Booking Methods: ${Object.entries(bookingMethodFrequency).map(([m, c]) => `${m}: ${c}`).join(' | ')}\n\n`;

  log += `💰 ORDER HISTORY:\n`;
  log += `  • Total Orders: ${orders.length}\n`;
  log += `  • Completed: ${orders.filter(o => o.payment_status === 'completed').length}\n`;
  log += `  • Total Revenue: $${orders.filter(o => o.payment_status === 'completed').reduce((s, o) => s + (o.amount_paid || 0), 0).toLocaleString()}\n\n`;

  log += `📞 CALL PERFORMANCE:\n`;
  log += `  • Total Calls: ${calls.length}\n`;
  log += `  • Successful Bookings: ${calls.filter(c => c.confirmation_number).length}\n`;
  const callSummaries = calls.filter(c => c.call_summary).slice(0, 5);
  if (callSummaries.length > 0) {
    log += `  • Recent Call Insights:\n`;
    callSummaries.forEach(c => {
      log += `    - [${c.airline}] ${c.call_summary?.substring(0, 100)}...\n`;
    });
  }
  log += '\n';

  // AI coaching insights
  if (reviews.length > 0) {
    const avgScore = reviews.reduce((s, r) => s + (r.overall_score || 0), 0) / reviews.length;
    const allStrengths = reviews.flatMap(r => r.strengths as string[] || []);
    const allWeaknesses = reviews.flatMap(r => r.weaknesses as string[] || []);
    const allSuggestions = reviews.flatMap(r => r.suggestions as string[] || []);
    
    log += `🧠 AI COACHING INSIGHTS:\n`;
    log += `  • Avg Performance Score: ${avgScore.toFixed(1)}/10\n`;
    log += `  • Top Strengths: ${extractPopularItems(allStrengths).slice(0, 5).join(', ')}\n`;
    log += `  • Areas to Improve: ${extractPopularItems(allWeaknesses).slice(0, 5).join(', ')}\n`;
    log += `  • Key Suggestions: ${extractPopularItems(allSuggestions).slice(0, 3).join('; ')}\n`;
  }

  return log;
}

// Helper functions

function extractTopics(messages: string[]): string[] {
  const keywords = new Map<string, number>();
  const importantPatterns = [
    /flight/i, /booking/i, /ticket/i, /price/i, /quote/i,
    /voucher/i, /refund/i, /cancel/i, /change/i, /payment/i,
    /first class/i, /business class/i, /economy/i,
    /international/i, /domestic/i, /miles/i, /points/i,
  ];
  
  const destinations = new Set<string>();
  const destinationPattern = /(?:to|from|→)\s+([A-Z]{3}|[A-Za-z]+(?:\s+[A-Za-z]+)?)/g;
  
  messages.forEach(msg => {
    if (!msg) return;
    
    importantPatterns.forEach(pattern => {
      if (pattern.test(msg)) {
        const match = msg.match(pattern)?.[0]?.toLowerCase();
        if (match) keywords.set(match, (keywords.get(match) || 0) + 1);
      }
    });
    
    let destMatch;
    while ((destMatch = destinationPattern.exec(msg)) !== null) {
      destinations.add(destMatch[1]);
    }
  });

  const topKeywords = [...keywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
  
  return [...topKeywords, ...[...destinations].slice(0, 3)];
}

function extractPopularItems(items: string[]): string[] {
  const frequency = new Map<string, number>();
  items.forEach(item => {
    if (item) frequency.set(item, (frequency.get(item) || 0) + 1);
  });
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([item]) => item);
}

function generateKeyEvents(quotes: any[], orders: any[], tickets: any[], calls: any[]): string[] {
  const events: string[] = [];
  
  // High-value quotes
  const highValueQuotes = quotes.filter(q => (q.quoted_price || 0) > 2000);
  if (highValueQuotes.length > 0) {
    events.push(`${highValueQuotes.length} high-value quotes (>$2k) generated`);
  }
  
  // Large orders
  const largeOrders = orders.filter(o => (o.amount_paid || 0) > 1000);
  if (largeOrders.length > 0) {
    events.push(`${largeOrders.length} orders over $1,000 processed`);
  }
  
  // Successful bookings
  const confirmedBookings = calls.filter(c => c.confirmation_number);
  if (confirmedBookings.length > 0) {
    events.push(`${confirmedBookings.length} airline bookings confirmed via phone`);
  }
  
  // Pending attention
  const needsAttention = tickets.filter(t => t.status === 'submitted' || t.status === 'quoted');
  if (needsAttention.length > 0) {
    events.push(`${needsAttention.length} ticket requests awaiting action`);
  }
  
  return events;
}

/**
 * Get complete memory context for agent injection
 */
export async function getAgentMemoryContext(
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ shortTerm: string; longTerm: string }> {
  const [summary, detailedLog] = await Promise.all([
    fetchActivitySummary(supabaseUrl, supabaseKey, 14), // 2 weeks
    fetchDetailedActivityLog(supabaseUrl, supabaseKey, 90), // 90 days
  ]);

  return {
    shortTerm: formatActivityMemoryPrompt(summary),
    longTerm: detailedLog,
  };
}
