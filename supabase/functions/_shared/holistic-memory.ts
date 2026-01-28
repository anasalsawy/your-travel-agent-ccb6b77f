/**
 * HOLISTIC MEMORY LAYER
 * 
 * The "Global Briefing" - a human-readable narrative summary that gives agents
 * a big-picture feel of everything happening (recent + historical).
 * 
 * THREE LAYERS:
 * 1. Holistic (this file): Standing narrative understanding - always injected
 * 2. Context (slice): Recent events for short-term awareness  
 * 3. Precise (RAG/tool): On-demand semantic or exact queries
 * 
 * The holistic layer answers: "What is this site? What's been happening? 
 * What patterns exist? What problems recur?"
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { UnifiedMemory, UnifiedEvent, fetchUnifiedMemory } from "./unified-memory-core.ts";

// ═══════════════════════════════════════════════════════════════════
// GLOBAL BRIEFING STRUCTURE
// ═══════════════════════════════════════════════════════════════════

export interface GlobalBriefing {
  version: string;
  generated_at: string;
  
  // Static context (rarely changes)
  identity: {
    site_name: string;
    description: string;
    core_services: string[];
  };
  
  // Historical patterns (updated weekly)
  historical: {
    total_conversations: number;
    total_quotes: number;
    total_orders: number;
    total_tickets: number;
    common_routes: string[];
    popular_airlines: string[];
    avg_quote_value: number;
    conversion_patterns: string;
  };
  
  // Recent activity (updated frequently)
  recent: {
    period: string;
    summary: string;
    key_events: string[];
    active_issues: string[];
    notable_customers: string[];
    revenue_snapshot: string;
  };
  
  // Learned patterns (from Maya coaching)
  insights: {
    what_works: string[];
    what_fails: string[];
    common_objections: string[];
    successful_tactics: string[];
  };
  
  // Compiled narrative for injection
  narrative: string;
}

// ═══════════════════════════════════════════════════════════════════
// BRIEFING GENERATION
// ═══════════════════════════════════════════════════════════════════

export async function generateGlobalBriefing(
  supabase: SupabaseClient,
  memory: UnifiedMemory
): Promise<GlobalBriefing> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Categorize events
  const conversations = memory.events.filter(e => e.type === 'conversation_started');
  const messages = memory.events.filter(e => e.type === 'message');
  const quotes = memory.events.filter(e => e.type === 'quote');
  const orders = memory.events.filter(e => e.type === 'order');
  const tickets = memory.events.filter(e => e.type === 'ticket');
  const calls = memory.events.filter(e => e.type === 'call');
  const alerts = memory.events.filter(e => e.type === 'alert');
  const reviews = memory.events.filter(e => e.type === 'review');

  // Recent events (last 24h)
  const recentQuotes = quotes.filter(q => q.ts >= last24h);
  const recentOrders = orders.filter(o => o.ts >= last24h);
  const recentAlerts = alerts.filter(a => a.ts >= last24h);
  const recentConvos = conversations.filter(c => c.ts >= last24h);

  // Extract patterns
  const routes = extractTopRoutes(tickets, quotes);
  const airlines = extractTopAirlines(tickets, quotes);
  const avgQuoteValue = calculateAvgQuoteValue(quotes);

  // Fetch Maya learnings for insights
  const { data: learnings } = await supabase
    .from('maya_global_learnings')
    .select('*')
    .eq('is_active', true)
    .gte('confidence_score', 7)
    .order('success_rate', { ascending: false })
    .limit(10);

  // Build recent activity summary
  const recentRevenue = recentOrders.reduce((sum, o) => 
    sum + (Number(o.data.amount_paid) || 0), 0
  );

  const keyEvents = buildKeyEvents(recentQuotes, recentOrders, recentAlerts, calls.filter(c => c.ts >= last24h));
  const activeIssues = extractActiveIssues(recentAlerts, tickets.filter(t => 
    t.data.status === 'submitted' || t.data.status === 'quoted'
  ));

  // Build the briefing
  const briefing: GlobalBriefing = {
    version: '1.0',
    generated_at: now.toISOString(),
    
    identity: {
      site_name: 'SpareFare',
      description: 'Premium travel concierge that books discounted flights using gift cards and points. AI-powered Maya handles customer conversations across web, WhatsApp, and voice.',
      core_services: [
        'Discounted flight bookings (40-70% off)',
        'Gift card and points redemption',
        'Marketplace for buyer/seller matching',
        'Multi-channel customer support (Maya AI)',
      ],
    },

    historical: {
      total_conversations: conversations.length,
      total_quotes: quotes.length,
      total_orders: orders.length,
      total_tickets: tickets.length,
      common_routes: routes.slice(0, 5),
      popular_airlines: airlines.slice(0, 5),
      avg_quote_value: avgQuoteValue,
      conversion_patterns: analyzeConversion(quotes, orders, tickets),
    },

    recent: {
      period: 'Last 24 hours',
      summary: buildRecentSummary(recentConvos.length, recentQuotes.length, recentOrders.length, recentRevenue),
      key_events: keyEvents,
      active_issues: activeIssues,
      notable_customers: extractNotableCustomers(recentQuotes, recentOrders),
      revenue_snapshot: `$${recentRevenue.toLocaleString()} in last 24h`,
    },

    insights: {
      what_works: (learnings || [])
        .filter(l => l.learning_type === 'tactic' && (l.success_rate || 0) > 70)
        .map(l => l.title),
      what_fails: (learnings || [])
        .filter(l => (l.failure_count || 0) > (l.success_count || 0))
        .map(l => l.title),
      common_objections: extractCommonObjections(reviews),
      successful_tactics: (learnings || [])
        .filter(l => l.success_rate && l.success_rate > 80)
        .map(l => `${l.title}: ${l.description}`).slice(0, 5),
    },

    narrative: '', // Will be generated below
  };

  // Generate the final narrative
  briefing.narrative = compileNarrative(briefing);

  return briefing;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function extractTopRoutes(tickets: UnifiedEvent[], quotes: UnifiedEvent[]): string[] {
  const routeCounts: Record<string, number> = {};
  
  tickets.forEach(t => {
    const route = `${t.data.origin}→${t.data.destination}`;
    routeCounts[route] = (routeCounts[route] || 0) + 1;
  });
  
  quotes.forEach(q => {
    if (q.data.route) {
      const route = q.data.route as string;
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    }
  });

  return Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([route]) => route);
}

function extractTopAirlines(tickets: UnifiedEvent[], quotes: UnifiedEvent[]): string[] {
  const airlineCounts: Record<string, number> = {};
  
  tickets.forEach(t => {
    if (t.data.preferred_airline) {
      airlineCounts[t.data.preferred_airline as string] = 
        (airlineCounts[t.data.preferred_airline as string] || 0) + 1;
    }
  });

  return Object.entries(airlineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([airline]) => airline);
}

function calculateAvgQuoteValue(quotes: UnifiedEvent[]): number {
  if (quotes.length === 0) return 0;
  const total = quotes.reduce((sum, q) => sum + (Number(q.data.quoted_price) || 0), 0);
  return Math.round(total / quotes.length);
}

function analyzeConversion(quotes: UnifiedEvent[], orders: UnifiedEvent[], tickets: UnifiedEvent[]): string {
  const acceptedQuotes = quotes.filter(q => q.data.status === 'accepted').length;
  const rate = quotes.length > 0 ? Math.round((acceptedQuotes / quotes.length) * 100) : 0;
  return `${rate}% quote acceptance rate (${acceptedQuotes}/${quotes.length} quotes converted)`;
}

function buildRecentSummary(convos: number, quotes: number, orders: number, revenue: number): string {
  const parts = [];
  if (convos > 0) parts.push(`${convos} conversations`);
  if (quotes > 0) parts.push(`${quotes} quotes generated`);
  if (orders > 0) parts.push(`${orders} orders ($${revenue.toLocaleString()})`);
  return parts.length > 0 ? parts.join(', ') : 'Quiet period - no significant activity';
}

function buildKeyEvents(
  quotes: UnifiedEvent[], 
  orders: UnifiedEvent[], 
  alerts: UnifiedEvent[],
  calls: UnifiedEvent[]
): string[] {
  const events: string[] = [];

  // High-value quotes
  quotes
    .filter(q => (Number(q.data.quoted_price) || 0) > 2000)
    .slice(-3)
    .forEach(q => {
      events.push(`💰 High-value quote: ${q.data.route} for $${q.data.quoted_price}`);
    });

  // Completed orders
  orders
    .filter(o => o.data.order_status === 'completed' || o.data.payment_status === 'completed')
    .slice(-3)
    .forEach(o => {
      events.push(`✅ Order completed: $${o.data.amount_paid}`);
    });

  // Important alerts
  alerts.slice(-3).forEach(a => {
    events.push(`⚠️ ${a.data.alert_type}: ${(a.data.message as string)?.slice(0, 50)}`);
  });

  // Successful calls
  calls
    .filter(c => c.data.status === 'completed' && c.data.confirmation_number)
    .slice(-2)
    .forEach(c => {
      events.push(`📞 Successful booking: ${c.data.airline} - ${c.data.confirmation_number}`);
    });

  return events.slice(0, 10);
}

function extractActiveIssues(alerts: UnifiedEvent[], pendingTickets: UnifiedEvent[]): string[] {
  const issues: string[] = [];

  // Unresolved alerts
  alerts
    .filter(a => !a.data.responded_at && !a.data.is_read)
    .forEach(a => {
      issues.push(`Alert: ${a.data.alert_type} - ${(a.data.message as string)?.slice(0, 40)}`);
    });

  // Stale pending tickets (>2 days old)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  pendingTickets
    .filter(t => t.ts < twoDaysAgo)
    .slice(-3)
    .forEach(t => {
      issues.push(`Pending ticket: ${t.data.origin}→${t.data.destination} (submitted ${new Date(t.ts).toLocaleDateString()})`);
    });

  return issues;
}

function extractNotableCustomers(quotes: UnifiedEvent[], orders: UnifiedEvent[]): string[] {
  const customers: string[] = [];
  const seen = new Set<string>();

  [...quotes, ...orders].forEach(e => {
    const email = (e.data.customer_email || e.data.contact_email) as string;
    const name = e.data.customer_name as string;
    if (email && !seen.has(email)) {
      seen.add(email);
      customers.push(name ? `${name} (${email})` : email);
    }
  });

  return customers.slice(0, 5);
}

function extractCommonObjections(reviews: UnifiedEvent[]): string[] {
  const objections: string[] = [];
  
  reviews.forEach(r => {
    const weaknesses = r.data.weaknesses as string[];
    if (weaknesses) objections.push(...weaknesses);
  });

  // Deduplicate and take top
  return [...new Set(objections)].slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════
// NARRATIVE COMPILATION
// ═══════════════════════════════════════════════════════════════════

function compileNarrative(briefing: GlobalBriefing): string {
  return `
═══════════════════════════════════════════════════════════════════
🌐 HOLISTIC MEMORY: GLOBAL BRIEFING
═══════════════════════════════════════════════════════════════════

You are the AI brain of ${briefing.identity.site_name}.
${briefing.identity.description}

CORE SERVICES:
${briefing.identity.core_services.map(s => `  • ${s}`).join('\n')}

═══════════════════════════════════════════════════════════════════
📊 HISTORICAL CONTEXT (All-Time Patterns)
═══════════════════════════════════════════════════════════════════

Business Scale:
  • ${briefing.historical.total_conversations} total conversations
  • ${briefing.historical.total_quotes} quotes generated
  • ${briefing.historical.total_orders} orders processed  
  • ${briefing.historical.total_tickets} ticket requests handled
  • Average quote value: $${briefing.historical.avg_quote_value}

Popular Routes: ${briefing.historical.common_routes.join(', ') || 'Varied'}
Top Airlines: ${briefing.historical.popular_airlines.join(', ') || 'All major carriers'}
Conversion: ${briefing.historical.conversion_patterns}

═══════════════════════════════════════════════════════════════════
⚡ RECENT ACTIVITY (${briefing.recent.period})
═══════════════════════════════════════════════════════════════════

Summary: ${briefing.recent.summary}
Revenue: ${briefing.recent.revenue_snapshot}

Key Events:
${briefing.recent.key_events.length > 0 
  ? briefing.recent.key_events.map(e => `  ${e}`).join('\n')
  : '  No significant events'}

${briefing.recent.active_issues.length > 0 
  ? `⚠️ Active Issues:\n${briefing.recent.active_issues.map(i => `  • ${i}`).join('\n')}`
  : '✅ No outstanding issues'}

Notable Customers: ${briefing.recent.notable_customers.join(', ') || 'None recently'}

═══════════════════════════════════════════════════════════════════
🧠 LEARNED INSIGHTS (From Past Interactions)
═══════════════════════════════════════════════════════════════════

${briefing.insights.successful_tactics.length > 0 
  ? `What Works:\n${briefing.insights.successful_tactics.map(t => `  ✅ ${t}`).join('\n')}`
  : ''}

${briefing.insights.common_objections.length > 0 
  ? `Common Objections:\n${briefing.insights.common_objections.map(o => `  ⚠️ ${o}`).join('\n')}`
  : ''}

═══════════════════════════════════════════════════════════════════

📍 Briefing generated: ${new Date(briefing.generated_at).toLocaleString()}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════
// CACHE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

export async function saveGlobalBriefing(
  supabase: SupabaseClient,
  briefing: GlobalBriefing
): Promise<void> {
  const { error } = await supabase.from('agent_memory_cache').upsert({
    memory_type: 'global_briefing',
    compiled_content: briefing.narrative,
    compiled_at: briefing.generated_at,
    stats: {
      version: briefing.version,
      historical: briefing.historical,
      recent_summary: briefing.recent.summary,
      issues_count: briefing.recent.active_issues.length,
    }
  }, { onConflict: 'memory_type' });

  if (error) {
    console.error('[Memory] saveGlobalBriefing failed:', error);
    throw new Error(`Failed to save global briefing: ${error.message}`);
  }
}

export async function loadGlobalBriefing(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('agent_memory_cache')
    .select('compiled_content, compiled_at')
    .eq('memory_type', 'global_briefing')
    .maybeSingle();

  if (error) {
    console.error('[Memory] loadGlobalBriefing failed:', error);
    return null;
  }

  return data?.compiled_content || null;
}

// ═══════════════════════════════════════════════════════════════════
// COMBINED PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a complete agent context combining:
 * 1. Holistic (global briefing)
 * 2. Context (recent slice) 
 * 3. Precise (on-demand via tools)
 */
export async function buildAgentContext(
  supabase: SupabaseClient,
  options: { includeHolistic?: boolean } = {}
): Promise<string> {
  if (options.includeHolistic === false) {
    return '';
  }

  try {
    const briefing = await loadGlobalBriefing(supabase);
    
    if (!briefing) {
      console.warn('[Memory] Global briefing not found - returning fallback');
      return '⚠️ (Holistic memory unavailable – global briefing not generated yet. Run "refresh_holistic" action to populate.)';
    }
    
    return briefing;
  } catch (error) {
    console.error('[Memory] buildAgentContext error:', error);
    return '⚠️ (Holistic memory error – could not load global briefing)';
  }
}
