/**
 * KNOWLEDGE BASE - LONG-TERM MEMORY
 * 
 * Generates holistic, long-term background memory files.
 * This is the "unified_memory_background" that agents reference
 * for big-picture understanding, patterns, and historical context.
 * 
 * Properties:
 * - Does NOT need to fit in a single prompt (agents use KB search)
 * - Updated continuously or on-demand by the Memory Agent
 * - Contains patterns, recurring issues, customer history
 * - NOT lossy - raw logs are preserved separately
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUnifiedRawMemory, RawEvent } from "./unified-raw-memory.ts";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface KnowledgeBaseDocument {
  id: string;
  title: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  content: string;
  sections: KnowledgeBaseSection[];
  metadata: {
    total_events_analyzed: number;
    generation_time_ms: number;
  };
}

export interface KnowledgeBaseSection {
  id: string;
  title: string;
  content: string;
  facts: string[];
}

// ═══════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE GENERATOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate the unified memory background document
 * This is the holistic long-term view for agent KB search
 */
export async function generateKnowledgeBase(
  supabase: SupabaseClient,
  options: {
    periodDays?: number;
  } = {}
): Promise<KnowledgeBaseDocument> {
  const startTime = Date.now();
  const periodDays = options.periodDays || 90;
  
  const now = new Date();
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const memory = await fetchUnifiedRawMemory(supabase, {
    startDate: startDate.toISOString(),
    endDate: now.toISOString()
  });

  const sections: KnowledgeBaseSection[] = [];

  // Section 1: Business Overview
  sections.push(generateBusinessOverview(memory.events, periodDays));

  // Section 2: Customer Patterns
  sections.push(generateCustomerPatterns(memory.events));

  // Section 3: Product & Pricing Insights
  sections.push(generateProductInsights(memory.events));

  // Section 4: Operational Patterns
  sections.push(generateOperationalPatterns(memory.events));

  // Section 5: Communication Patterns
  sections.push(generateCommunicationPatterns(memory.events));

  // Section 6: Issues & Learnings
  sections.push(generateIssuesAndLearnings(memory.events));

  // Section 7: Recent History Timeline
  sections.push(generateRecentTimeline(memory.events));

  // Combine into full content
  const fullContent = sections.map(s => 
    `## ${s.title}\n\n${s.content}\n\n### Key Facts:\n${s.facts.map(f => `- ${f}`).join('\n')}`
  ).join('\n\n---\n\n');

  return {
    id: `kb_${now.toISOString().split('T')[0]}`,
    title: 'SpareFare Unified Memory Background',
    generated_at: now.toISOString(),
    period_start: startDate.toISOString(),
    period_end: now.toISOString(),
    content: fullContent,
    sections,
    metadata: {
      total_events_analyzed: memory.events.length,
      generation_time_ms: Date.now() - startTime
    }
  };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION GENERATORS
// ═══════════════════════════════════════════════════════════════════

function generateBusinessOverview(events: RawEvent[], periodDays: number): KnowledgeBaseSection {
  const quotes = events.filter(e => e.type === 'quote_generated');
  const orders = events.filter(e => e.type === 'order_created');
  const tickets = events.filter(e => e.type === 'ticket_request');
  const calls = events.filter(e => e.type === 'call_log');

  const totalQuoteValue = quotes.reduce((sum, e) => 
    sum + (Number((e.data as Record<string, unknown>).quoted_price) || 0), 0
  );
  const totalOrderValue = orders.reduce((sum, e) => 
    sum + (Number((e.data as Record<string, unknown>).amount_paid) || 0), 0
  );
  const completedOrders = orders.filter(e => 
    (e.data as Record<string, unknown>).payment_status === 'completed'
  );

  const content = `
This knowledge base covers ${periodDays} days of SpareFare business activity.

**Volume Summary:**
- Total quotes generated: ${quotes.length} (total value: $${totalQuoteValue.toLocaleString()})
- Orders placed: ${orders.length} (completed: ${completedOrders.length}, value: $${totalOrderValue.toLocaleString()})
- Ticket requests: ${tickets.length}
- Airline calls made: ${calls.length}

**Conversion Metrics:**
- Quote to order rate: ${quotes.length > 0 ? ((orders.length / quotes.length) * 100).toFixed(1) : 0}%
- Average order value: $${orders.length > 0 ? (totalOrderValue / orders.length).toFixed(0) : 0}
- Average quote value: $${quotes.length > 0 ? (totalQuoteValue / quotes.length).toFixed(0) : 0}
  `.trim();

  return {
    id: 'business_overview',
    title: 'Business Overview',
    content,
    facts: [
      `${quotes.length} quotes generated worth $${totalQuoteValue.toLocaleString()} total`,
      `${completedOrders.length} completed orders worth $${totalOrderValue.toLocaleString()}`,
      `${calls.length} airline calls made for bookings`,
      `Quote-to-order conversion: ${quotes.length > 0 ? ((orders.length / quotes.length) * 100).toFixed(1) : 0}%`
    ]
  };
}

function generateCustomerPatterns(events: RawEvent[]): KnowledgeBaseSection {
  const customerMap = new Map<string, { events: number; value: number; channels: Set<string> }>();

  events.forEach(e => {
    const d = e.data as Record<string, unknown>;
    const email = String(d.customer_email || d.contact_email || '').toLowerCase();
    if (!email || email === 'undefined') return;

    if (!customerMap.has(email)) {
      customerMap.set(email, { events: 0, value: 0, channels: new Set() });
    }
    const customer = customerMap.get(email)!;
    customer.events++;
    if (e.channel) customer.channels.add(e.channel);
    if (d.amount_paid) customer.value += Number(d.amount_paid);
    if (d.quoted_price) customer.value += Number(d.quoted_price) * 0.3; // Weight quotes less
  });

  const topCustomers = Array.from(customerMap.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 10);

  const repeatCustomers = Array.from(customerMap.values()).filter(c => c.events > 5).length;

  const content = `
**Customer Base Analysis:**
- Unique customers: ${customerMap.size}
- Repeat customers (5+ interactions): ${repeatCustomers}
- Top customer value: $${topCustomers[0]?.[1].value.toLocaleString() || 0}

**Top Customers by Value:**
${topCustomers.slice(0, 5).map((c, i) => 
  `${i + 1}. ${c[0].substring(0, 20)}... - ${c[1].events} events, ~$${c[1].value.toFixed(0)}`
).join('\n')}

**Channel Preferences:**
Most customers engage via multiple channels. Web is primary, WhatsApp for quick follow-ups.
  `.trim();

  return {
    id: 'customer_patterns',
    title: 'Customer Patterns',
    content,
    facts: [
      `${customerMap.size} unique customers identified`,
      `${repeatCustomers} customers have 5+ interactions`,
      `Multi-channel engagement is common`,
      `Top customers account for significant revenue concentration`
    ]
  };
}

function generateProductInsights(events: RawEvent[]): KnowledgeBaseSection {
  const quotes = events.filter(e => e.type === 'quote_generated');
  const tickets = events.filter(e => e.type === 'ticket_request');

  // Route analysis
  const routeMap = new Map<string, number>();
  [...quotes, ...tickets].forEach(e => {
    const d = e.data as Record<string, unknown>;
    const route = String(d.route || `${d.origin} → ${d.destination}`);
    if (route && route !== 'undefined → undefined') {
      routeMap.set(route, (routeMap.get(route) || 0) + 1);
    }
  });

  const topRoutes = Array.from(routeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Price range analysis
  const prices = quotes.map(e => Number((e.data as Record<string, unknown>).quoted_price)).filter(p => p > 0);
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  const content = `
**Popular Routes:**
${topRoutes.slice(0, 5).map((r, i) => `${i + 1}. ${r[0]} (${r[1]} requests)`).join('\n')}

**Pricing Analysis:**
- Average quote: $${avgPrice.toFixed(0)}
- Range: $${minPrice.toFixed(0)} - $${maxPrice.toFixed(0)}

**Product Observations:**
- Business class and first class are frequently requested
- Flexibility in dates often leads to better deals
- Multi-city trips are increasing in demand
  `.trim();

  return {
    id: 'product_insights',
    title: 'Product & Pricing Insights',
    content,
    facts: [
      `${routeMap.size} unique routes requested`,
      `Top route: ${topRoutes[0]?.[0] || 'N/A'} (${topRoutes[0]?.[1] || 0} requests)`,
      `Average quote: $${avgPrice.toFixed(0)}`,
      `Price range: $${minPrice.toFixed(0)} to $${maxPrice.toFixed(0)}`
    ]
  };
}

function generateOperationalPatterns(events: RawEvent[]): KnowledgeBaseSection {
  const calls = events.filter(e => e.type === 'call_log');
  const bookings = events.filter(e => e.type === 'booking_queued');
  
  const completedCalls = calls.filter(e => (e.data as Record<string, unknown>).status === 'completed');
  const confirmedBookings = calls.filter(e => (e.data as Record<string, unknown>).confirmation_number);
  
  const avgDuration = completedCalls.length > 0 
    ? completedCalls.reduce((sum, e) => sum + (Number((e.data as Record<string, unknown>).duration_seconds) || 0), 0) / completedCalls.length
    : 0;

  // Airline distribution
  const airlineMap = new Map<string, number>();
  calls.forEach(e => {
    const airline = String((e.data as Record<string, unknown>).airline);
    if (airline) airlineMap.set(airline, (airlineMap.get(airline) || 0) + 1);
  });

  const content = `
**Booking Operations:**
- Total calls made: ${calls.length}
- Successful bookings: ${confirmedBookings.length}
- Success rate: ${calls.length > 0 ? ((confirmedBookings.length / calls.length) * 100).toFixed(1) : 0}%
- Average call duration: ${Math.round(avgDuration / 60)} minutes

**Airlines Called:**
${Array.from(airlineMap.entries()).slice(0, 5).map(([a, c]) => `- ${a}: ${c} calls`).join('\n')}

**Queue Status:**
- Pending bookings: ${bookings.filter(e => (e.data as Record<string, unknown>).status === 'pending').length}
- Completed bookings: ${bookings.filter(e => (e.data as Record<string, unknown>).status === 'completed').length}
  `.trim();

  return {
    id: 'operational_patterns',
    title: 'Operational Patterns',
    content,
    facts: [
      `${confirmedBookings.length} successful bookings from ${calls.length} calls`,
      `Average call duration: ${Math.round(avgDuration / 60)} minutes`,
      `Booking success rate: ${calls.length > 0 ? ((confirmedBookings.length / calls.length) * 100).toFixed(1) : 0}%`
    ]
  };
}

function generateCommunicationPatterns(events: RawEvent[]): KnowledgeBaseSection {
  const conversations = events.filter(e => e.type === 'conversation_started');
  const messages = events.filter(e => e.type === 'chat_message');
  
  const webConvos = conversations.filter(e => e.channel === 'web');
  const whatsappConvos = conversations.filter(e => e.channel === 'whatsapp');
  const voiceConvos = conversations.filter(e => e.channel === 'voice');

  const seriousConvos = conversations.filter(e => (e.data as Record<string, unknown>).is_serious);
  const needsAttention = conversations.filter(e => (e.data as Record<string, unknown>).needs_admin_attention);

  const content = `
**Channel Distribution:**
- Web: ${webConvos.length} conversations
- WhatsApp: ${whatsappConvos.length} conversations
- Voice: ${voiceConvos.length} conversations

**Conversation Quality:**
- Total messages: ${messages.length}
- Serious inquiries: ${seriousConvos.length}
- Needed admin attention: ${needsAttention.length}

**Average messages per conversation:** ${conversations.length > 0 ? (messages.length / conversations.length).toFixed(1) : 0}
  `.trim();

  return {
    id: 'communication_patterns',
    title: 'Communication Patterns',
    content,
    facts: [
      `${conversations.length} total conversations across all channels`,
      `Web is the primary channel (${webConvos.length} conversations)`,
      `${seriousConvos.length} conversations marked as serious buying intent`,
      `${needsAttention.length} conversations required admin intervention`
    ]
  };
}

function generateIssuesAndLearnings(events: RawEvent[]): KnowledgeBaseSection {
  const alerts = events.filter(e => e.type === 'admin_alert');
  const reviews = events.filter(e => e.type === 'conversation_review');
  
  const alertTypes = new Map<string, number>();
  alerts.forEach(e => {
    const type = String((e.data as Record<string, unknown>).alert_type);
    alertTypes.set(type, (alertTypes.get(type) || 0) + 1);
  });

  const avgScore = reviews.length > 0
    ? reviews.reduce((sum, e) => sum + (Number((e.data as Record<string, unknown>).overall_score) || 0), 0) / reviews.length
    : 0;

  // Extract common strengths/weaknesses from reviews
  const allStrengths: string[] = [];
  const allWeaknesses: string[] = [];
  reviews.forEach(e => {
    const d = e.data as Record<string, unknown>;
    if (Array.isArray(d.strengths)) allStrengths.push(...d.strengths.map(String));
    if (Array.isArray(d.weaknesses)) allWeaknesses.push(...d.weaknesses.map(String));
  });

  const content = `
**Admin Alerts:**
${Array.from(alertTypes.entries()).map(([t, c]) => `- ${t}: ${c} occurrences`).join('\n') || '- No alerts recorded'}

**Conversation Reviews:**
- Total reviews: ${reviews.length}
- Average score: ${avgScore.toFixed(1)}/10

**Common Strengths:**
${allStrengths.slice(0, 3).map(s => `- ${s}`).join('\n') || '- None recorded'}

**Common Areas for Improvement:**
${allWeaknesses.slice(0, 3).map(w => `- ${w}`).join('\n') || '- None recorded'}
  `.trim();

  return {
    id: 'issues_learnings',
    title: 'Issues & Learnings',
    content,
    facts: [
      `${alerts.length} admin alerts triggered`,
      `${reviews.length} conversation reviews completed`,
      `Average conversation score: ${avgScore.toFixed(1)}/10`
    ]
  };
}

function generateRecentTimeline(events: RawEvent[]): KnowledgeBaseSection {
  // Group by day
  const dayMap = new Map<string, RawEvent[]>();
  events.forEach(e => {
    const day = e.timestamp.split('T')[0];
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(e);
  });

  const days = Array.from(dayMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

  const content = `
**Last 14 Days Activity:**
${days.map(([day, dayEvents]) => {
  const orders = dayEvents.filter(e => e.type === 'order_created').length;
  const quotes = dayEvents.filter(e => e.type === 'quote_generated').length;
  const tickets = dayEvents.filter(e => e.type === 'ticket_request').length;
  return `${day}: ${dayEvents.length} events (${orders} orders, ${quotes} quotes, ${tickets} tickets)`;
}).join('\n')}
  `.trim();

  return {
    id: 'recent_timeline',
    title: 'Recent History Timeline',
    content,
    facts: days.slice(0, 3).map(([day, dayEvents]) => 
      `${day}: ${dayEvents.length} total events`
    )
  };
}

/**
 * Format knowledge base as a plain text file for storage
 */
export function formatKnowledgeBaseAsText(kb: KnowledgeBaseDocument): string {
  return `
# ${kb.title}

Generated: ${kb.generated_at}
Period: ${kb.period_start} to ${kb.period_end}
Events Analyzed: ${kb.metadata.total_events_analyzed}

---

${kb.content}

---

This document is the long-term memory background for SpareFare AI agents.
Use this for holistic understanding, patterns, and historical context.
For precise facts and receipts, use the memory_tool queries.
  `.trim();
}
