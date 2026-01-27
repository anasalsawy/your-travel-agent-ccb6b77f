/**
 * PRECISION MEMORY QUERIES
 * 
 * This module provides structured query functions for the unified raw memory.
 * Agents use these for exact details / receipts when giving factual answers.
 * 
 * All functions return structured JSON, not prose.
 * All important fields are included - nothing is hidden.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RawEvent, fetchUnifiedRawMemory } from "./unified-raw-memory.ts";

// ═══════════════════════════════════════════════════════════════════
// QUERY RESULT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface QueryResult<T = RawEvent[]> {
  success: boolean;
  query_type: string;
  query_params: Record<string, unknown>;
  executed_at: string;
  result_count: number;
  data: T;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════
// PRECISION QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get events between two timestamps
 */
export async function getEventsBetween(
  supabase: SupabaseClient,
  start: string,
  end: string,
  eventTypes?: string[]
): Promise<QueryResult> {
  try {
    const memory = await fetchUnifiedRawMemory(supabase, { startDate: start, endDate: end });
    
    let events = memory.events;
    if (eventTypes && eventTypes.length > 0) {
      events = events.filter(e => eventTypes.includes(e.type));
    }

    return {
      success: true,
      query_type: 'get_events_between',
      query_params: { start, end, eventTypes },
      executed_at: new Date().toISOString(),
      result_count: events.length,
      data: events
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_events_between',
      query_params: { start, end, eventTypes },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get all events for a specific customer by ID, email, or phone
 */
export async function getEventsForCustomer(
  supabase: SupabaseClient,
  identifier: { customer_id?: string; email?: string; phone?: string },
  options: { start?: string; end?: string; limit?: number } = {}
): Promise<QueryResult> {
  try {
    const memory = await fetchUnifiedRawMemory(supabase, {
      startDate: options.start,
      endDate: options.end
    });

    const events = memory.events.filter(e => {
      const d = e.data as Record<string, unknown>;
      if (identifier.customer_id) {
        if (d.customer_id === identifier.customer_id || d.user_id === identifier.customer_id) return true;
      }
      if (identifier.email) {
        const email = identifier.email.toLowerCase();
        if (String(d.customer_email || '').toLowerCase() === email) return true;
        if (String(d.contact_email || '').toLowerCase() === email) return true;
      }
      if (identifier.phone) {
        const phone = identifier.phone.replace(/\D/g, '');
        if (String(d.customer_phone || '').replace(/\D/g, '').includes(phone)) return true;
        if (String(d.contact_phone || '').replace(/\D/g, '').includes(phone)) return true;
      }
      return false;
    });

    const finalEvents = options.limit ? events.slice(-options.limit) : events;

    return {
      success: true,
      query_type: 'get_events_for_customer',
      query_params: { identifier, options },
      executed_at: new Date().toISOString(),
      result_count: finalEvents.length,
      data: finalEvents
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_events_for_customer',
      query_params: { identifier, options },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get events by type within a time range
 */
export async function getEventsByType(
  supabase: SupabaseClient,
  eventType: string,
  start?: string,
  end?: string,
  limit?: number
): Promise<QueryResult> {
  try {
    const memory = await fetchUnifiedRawMemory(supabase, { startDate: start, endDate: end });
    
    let events = memory.events.filter(e => e.type === eventType);
    if (limit) events = events.slice(-limit);

    return {
      success: true,
      query_type: 'get_events_by_type',
      query_params: { eventType, start, end, limit },
      executed_at: new Date().toISOString(),
      result_count: events.length,
      data: events
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_events_by_type',
      query_params: { eventType, start, end, limit },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get full session history by session ID
 */
export async function getSessionHistory(
  supabase: SupabaseClient,
  sessionId: string
): Promise<QueryResult> {
  try {
    const memory = await fetchUnifiedRawMemory(supabase, {});
    
    const events = memory.events.filter(e => {
      const d = e.data as Record<string, unknown>;
      return d.session_id === sessionId || 
             String(d.conversation_id || '').includes(sessionId);
    });

    return {
      success: true,
      query_type: 'get_session_history',
      query_params: { sessionId },
      executed_at: new Date().toISOString(),
      result_count: events.length,
      data: events
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_session_history',
      query_params: { sessionId },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get recent failed payments
 */
export async function getRecentFailedPayments(
  supabase: SupabaseClient,
  limit: number = 20,
  timeframeDays: number = 7
): Promise<QueryResult> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    const memory = await fetchUnifiedRawMemory(supabase, { startDate: startDate.toISOString() });
    
    const failedPayments = memory.events.filter(e => {
      if (e.type !== 'order_created' && e.type !== 'ticket_request') return false;
      const d = e.data as Record<string, unknown>;
      return d.payment_status === 'failed' || d.payment_status === 'rejected';
    }).slice(-limit);

    return {
      success: true,
      query_type: 'get_recent_failed_payments',
      query_params: { limit, timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: failedPayments.length,
      data: failedPayments
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_recent_failed_payments',
      query_params: { limit, timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get quotes by status
 */
export async function getQuotesByStatus(
  supabase: SupabaseClient,
  status: string,
  limit: number = 50,
  timeframeDays: number = 14
): Promise<QueryResult> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    const memory = await fetchUnifiedRawMemory(supabase, { startDate: startDate.toISOString() });
    
    const quotes = memory.events.filter(e => {
      if (e.type !== 'quote_generated') return false;
      const d = e.data as Record<string, unknown>;
      return d.status === status;
    }).slice(-limit);

    return {
      success: true,
      query_type: 'get_quotes_by_status',
      query_params: { status, limit, timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: quotes.length,
      data: quotes
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_quotes_by_status',
      query_params: { status, limit, timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

/**
 * Get recent activity summary (counts by type)
 */
export async function getActivitySummary(
  supabase: SupabaseClient,
  timeframeDays: number = 7
): Promise<QueryResult<Record<string, unknown>>> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    const memory = await fetchUnifiedRawMemory(supabase, { startDate: startDate.toISOString() });
    
    // Compute summary statistics
    const summary: Record<string, unknown> = {
      period_days: timeframeDays,
      total_events: memory.events.length,
      events_by_type: memory.metadata.event_types,
      channels: {
        web: memory.events.filter(e => e.channel === 'web').length,
        whatsapp: memory.events.filter(e => e.channel === 'whatsapp').length,
        voice: memory.events.filter(e => e.channel === 'voice').length,
      },
      quotes: {
        total: memory.events.filter(e => e.type === 'quote_generated').length,
        total_value: memory.events
          .filter(e => e.type === 'quote_generated')
          .reduce((sum, e) => sum + (Number((e.data as Record<string, unknown>).quoted_price) || 0), 0),
      },
      orders: {
        total: memory.events.filter(e => e.type === 'order_created').length,
        total_value: memory.events
          .filter(e => e.type === 'order_created')
          .reduce((sum, e) => sum + (Number((e.data as Record<string, unknown>).amount_paid) || 0), 0),
      },
      tickets: {
        total: memory.events.filter(e => e.type === 'ticket_request').length,
      },
      calls: {
        total: memory.events.filter(e => e.type === 'call_log').length,
        with_confirmation: memory.events.filter(e => 
          e.type === 'call_log' && (e.data as Record<string, unknown>).confirmation_number
        ).length,
      },
    };

    return {
      success: true,
      query_type: 'get_activity_summary',
      query_params: { timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: 1,
      data: summary
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'get_activity_summary',
      query_params: { timeframeDays },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: {},
      error: String(error)
    };
  }
}

/**
 * Search events by keyword in content
 */
export async function searchEvents(
  supabase: SupabaseClient,
  keyword: string,
  options: { start?: string; end?: string; eventTypes?: string[]; limit?: number } = {}
): Promise<QueryResult> {
  try {
    const memory = await fetchUnifiedRawMemory(supabase, { 
      startDate: options.start, 
      endDate: options.end 
    });
    
    const searchLower = keyword.toLowerCase();
    let events = memory.events.filter(e => {
      // Search in stringified data
      const dataStr = JSON.stringify(e.data).toLowerCase();
      return dataStr.includes(searchLower);
    });

    if (options.eventTypes && options.eventTypes.length > 0) {
      events = events.filter(e => options.eventTypes!.includes(e.type));
    }

    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return {
      success: true,
      query_type: 'search_events',
      query_params: { keyword, options },
      executed_at: new Date().toISOString(),
      result_count: events.length,
      data: events
    };
  } catch (error) {
    return {
      success: false,
      query_type: 'search_events',
      query_params: { keyword, options },
      executed_at: new Date().toISOString(),
      result_count: 0,
      data: [],
      error: String(error)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UNIFIED QUERY DISPATCHER
// ═══════════════════════════════════════════════════════════════════

export type MemoryQueryType = 
  | 'get_events_between'
  | 'get_events_for_customer'
  | 'get_events_by_type'
  | 'get_session_history'
  | 'get_recent_failed_payments'
  | 'get_quotes_by_status'
  | 'get_activity_summary'
  | 'search_events';

export interface MemoryQuery {
  type: MemoryQueryType;
  params: Record<string, unknown>;
}

/**
 * Execute a memory query by type
 */
export async function executeMemoryQuery(
  supabase: SupabaseClient,
  query: MemoryQuery
): Promise<QueryResult<unknown>> {
  switch (query.type) {
    case 'get_events_between':
      return getEventsBetween(
        supabase,
        query.params.start as string,
        query.params.end as string,
        query.params.eventTypes as string[] | undefined
      );

    case 'get_events_for_customer':
      return getEventsForCustomer(
        supabase,
        query.params.identifier as { customer_id?: string; email?: string; phone?: string },
        query.params.options as { start?: string; end?: string; limit?: number } | undefined
      );

    case 'get_events_by_type':
      return getEventsByType(
        supabase,
        query.params.eventType as string,
        query.params.start as string | undefined,
        query.params.end as string | undefined,
        query.params.limit as number | undefined
      );

    case 'get_session_history':
      return getSessionHistory(supabase, query.params.sessionId as string);

    case 'get_recent_failed_payments':
      return getRecentFailedPayments(
        supabase,
        query.params.limit as number | undefined,
        query.params.timeframeDays as number | undefined
      );

    case 'get_quotes_by_status':
      return getQuotesByStatus(
        supabase,
        query.params.status as string,
        query.params.limit as number | undefined,
        query.params.timeframeDays as number | undefined
      );

    case 'get_activity_summary':
      return getActivitySummary(
        supabase,
        query.params.timeframeDays as number | undefined
      );

    case 'search_events':
      return searchEvents(
        supabase,
        query.params.keyword as string,
        query.params.options as { start?: string; end?: string; eventTypes?: string[]; limit?: number } | undefined
      );

    default:
      return {
        success: false,
        query_type: 'unknown',
        query_params: query.params,
        executed_at: new Date().toISOString(),
        result_count: 0,
        data: [],
        error: `Unknown query type: ${query.type}`
      };
  }
}
