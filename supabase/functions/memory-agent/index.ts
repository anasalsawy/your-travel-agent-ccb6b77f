/**
 * MEMORY AGENT
 * 
 * Dedicated agent whose only job is to manage memory:
 * 1. Maintain unified raw memory
 * 2. Regenerate/update Knowledge Base memory file
 * 3. Serve precision memory queries
 * 4. Generate short-term context slices
 * 
 * Invocation: Event-based or explicit calls (NO cron jobs)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchUnifiedRawMemory, createMemoryClient } from "../_shared/unified-raw-memory.ts";
import { executeMemoryQuery, MemoryQuery } from "../_shared/memory-queries.ts";
import { generateShortTermMemorySlice, formatShortTermMemoryForContext } from "../_shared/short-term-memory.ts";
import { generateKnowledgeBase, formatKnowledgeBaseAsText } from "../_shared/knowledge-base.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════
// ACTION TYPES
// ═══════════════════════════════════════════════════════════════════

type MemoryAgentAction = 
  | 'query'           // Execute a precision memory query
  | 'short_term'      // Generate short-term context slice
  | 'refresh_kb'      // Refresh the Knowledge Base document
  | 'get_kb'          // Get the current Knowledge Base content
  | 'health'          // Health check / status
  | 'raw_events';     // Get raw events (for debugging/admin)

interface MemoryAgentRequest {
  action: MemoryAgentAction;
  
  // For 'query' action
  query?: MemoryQuery;
  
  // For 'short_term' action
  short_term_options?: {
    lookback_hours?: number;
    max_chars?: number;
    focus_customer_id?: string;
    focus_event_types?: string[];
    format?: 'json' | 'text';
  };
  
  // For 'refresh_kb' and 'get_kb'
  kb_options?: {
    period_days?: number;
    store?: boolean; // Whether to store in DB
  };
  
  // For 'raw_events'
  raw_options?: {
    start_date?: string;
    end_date?: string;
    limit?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createMemoryClient();
    const request: MemoryAgentRequest = await req.json();

    console.log(`[MemoryAgent] Action: ${request.action}`);

    switch (request.action) {
      // ═══════════════════════════════════════════════════════════════
      // PRECISION MEMORY QUERY
      // ═══════════════════════════════════════════════════════════════
      case 'query': {
        if (!request.query) {
          return new Response(JSON.stringify({ 
            error: 'query is required for action=query' 
          }), { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }

        const result = await executeMemoryQuery(supabase, request.query);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // SHORT-TERM CONTEXT SLICE
      // ═══════════════════════════════════════════════════════════════
      case 'short_term': {
        const options = request.short_term_options || {};
        
        const slice = await generateShortTermMemorySlice(supabase, {
          lookbackHours: options.lookback_hours,
          maxChars: options.max_chars,
          focusCustomerId: options.focus_customer_id,
          focusEventTypes: options.focus_event_types,
        });

        if (options.format === 'text') {
          const textSlice = formatShortTermMemoryForContext(slice);
          return new Response(JSON.stringify({ 
            format: 'text',
            content: textSlice,
            metadata: {
              generated_at: slice.generated_at,
              lookback_hours: slice.lookback_hours,
              events_included: slice.summary.events_included,
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify(slice), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // REFRESH KNOWLEDGE BASE
      // ═══════════════════════════════════════════════════════════════
      case 'refresh_kb': {
        const options = request.kb_options || {};
        
        const kb = await generateKnowledgeBase(supabase, {
          periodDays: options.period_days || 90,
        });

        // Store in agent_memory_cache if requested
        if (options.store !== false) {
          const kbText = formatKnowledgeBaseAsText(kb);
          
          // Upsert to cache
          await supabase.from('agent_memory_cache').upsert({
            memory_type: 'knowledge_base',
            compiled_content: kbText,
            compiled_at: kb.generated_at,
            stats: {
              total_events: kb.metadata.total_events_analyzed,
              generation_time_ms: kb.metadata.generation_time_ms,
              sections: kb.sections.length,
              period_start: kb.period_start,
              period_end: kb.period_end,
            }
          }, { onConflict: 'memory_type' });

          console.log(`[MemoryAgent] KB stored in cache (${kb.metadata.total_events_analyzed} events)`);
        }

        return new Response(JSON.stringify({
          success: true,
          kb_id: kb.id,
          generated_at: kb.generated_at,
          events_analyzed: kb.metadata.total_events_analyzed,
          sections: kb.sections.length,
          stored: options.store !== false,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // GET CURRENT KNOWLEDGE BASE
      // ═══════════════════════════════════════════════════════════════
      case 'get_kb': {
        // Try to get from cache first
        const { data: cached } = await supabase
          .from('agent_memory_cache')
          .select('*')
          .eq('memory_type', 'knowledge_base')
          .single();

        if (cached) {
          return new Response(JSON.stringify({
            source: 'cache',
            compiled_at: cached.compiled_at,
            stats: cached.stats,
            content: cached.compiled_content,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Generate fresh if not cached
        const options = request.kb_options || {};
        const kb = await generateKnowledgeBase(supabase, {
          periodDays: options.period_days || 90,
        });

        return new Response(JSON.stringify({
          source: 'generated',
          compiled_at: kb.generated_at,
          stats: kb.metadata,
          content: formatKnowledgeBaseAsText(kb),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // RAW EVENTS (for debugging/admin)
      // ═══════════════════════════════════════════════════════════════
      case 'raw_events': {
        const options = request.raw_options || {};
        
        const memory = await fetchUnifiedRawMemory(supabase, {
          startDate: options.start_date,
          endDate: options.end_date,
          limit: options.limit || 100,
        });

        return new Response(JSON.stringify({
          events: memory.events,
          metadata: memory.metadata,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // HEALTH CHECK
      // ═══════════════════════════════════════════════════════════════
      case 'health': {
        // Quick health check - fetch minimal data
        const { data: cached } = await supabase
          .from('agent_memory_cache')
          .select('compiled_at, stats')
          .eq('memory_type', 'knowledge_base')
          .single();

        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          knowledge_base: cached ? {
            last_compiled: cached.compiled_at,
            stats: cached.stats,
          } : null,
          capabilities: [
            'query - Execute precision memory queries',
            'short_term - Generate context slice for agent injection',
            'refresh_kb - Refresh knowledge base document',
            'get_kb - Get current knowledge base content',
            'raw_events - Get raw events (admin)',
            'health - This endpoint',
          ],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: `Unknown action: ${request.action}`,
          valid_actions: ['query', 'short_term', 'refresh_kb', 'get_kb', 'raw_events', 'health']
        }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }

  } catch (error) {
    console.error('[MemoryAgent] Error:', error);
    return new Response(JSON.stringify({ 
      error: String(error),
      stack: (error as Error).stack,
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
