/**
 * MEMORY AGENT - Anas Memory Trio Orchestrator
 * 
 * ONE unified memory file, THREE access patterns:
 * 1. kb      - Full unified memory stored in KB
 * 2. slice   - Recent events for context injection  
 * 3. query   - Precision tool queries
 * 
 * Invocation: Event-based or explicit calls (NO cron jobs)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchUnifiedMemory,
  saveUnifiedMemoryToKB,
  loadUnifiedMemoryFromKB,
  generateSlice,
  queryUnifiedMemory,
  MEMORY_TOOL_DEFINITION,
  type MemoryQuery,
  type QueryType,
} from "../_shared/unified-memory-core.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function createSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ═══════════════════════════════════════════════════════════════════
// REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════

type Action = 
  | 'refresh'    // Refresh unified memory in KB
  | 'get_kb'     // Get full KB memory
  | 'slice'      // Get context slice
  | 'query'      // Precision query
  | 'health';    // Health check

interface Request {
  action: Action;
  
  // For 'slice'
  slice_options?: {
    hours?: number;
    max_tokens?: number;
    focus_types?: string[];
  };
  
  // For 'query'
  query?: {
    type: QueryType;
    params: Record<string, unknown>;
  };
  
  // For 'refresh'
  refresh_options?: {
    days?: number;
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
    const supabase = createSupabase();
    const request: Request = await req.json();

    console.log(`[MemoryAgent] Action: ${request.action}`);

    switch (request.action) {
      // ═══════════════════════════════════════════════════════════════
      // REFRESH: Update unified memory in KB
      // ═══════════════════════════════════════════════════════════════
      case 'refresh': {
        const days = request.refresh_options?.days || 90;
        const startTime = Date.now();
        
        // Fetch fresh unified memory
        const memory = await fetchUnifiedMemory(supabase, { days });
        
        // Save to KB
        await saveUnifiedMemoryToKB(supabase, memory);
        
        const duration = Date.now() - startTime;
        console.log(`[MemoryAgent] Refreshed: ${memory.total_events} events in ${duration}ms`);

        return json({
          success: true,
          events_count: memory.total_events,
          period: memory.period,
          duration_ms: duration,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // GET_KB: Return full unified memory
      // ═══════════════════════════════════════════════════════════════
      case 'get_kb': {
        let memory = await loadUnifiedMemoryFromKB(supabase);
        
        // If no cached memory, generate fresh
        if (!memory) {
          console.log('[MemoryAgent] No cached memory, generating fresh...');
          memory = await fetchUnifiedMemory(supabase, { days: 90 });
          await saveUnifiedMemoryToKB(supabase, memory);
        }

        return json({
          source: memory ? 'cache' : 'fresh',
          generated_at: memory.generated_at,
          total_events: memory.total_events,
          period: memory.period,
          events: memory.events,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // SLICE: Get recent events for context injection
      // ═══════════════════════════════════════════════════════════════
      case 'slice': {
        let memory = await loadUnifiedMemoryFromKB(supabase);
        
        if (!memory) {
          memory = await fetchUnifiedMemory(supabase, { days: 14 });
        }

        const slice = generateSlice(memory, {
          hours: request.slice_options?.hours || 24,
          maxTokens: request.slice_options?.max_tokens || 8000,
          focusTypes: request.slice_options?.focus_types,
        });

        return json(slice);
      }

      // ═══════════════════════════════════════════════════════════════
      // QUERY: Precision memory queries
      // ═══════════════════════════════════════════════════════════════
      case 'query': {
        if (!request.query) {
          return json({ error: 'query is required' }, 400);
        }

        let memory = await loadUnifiedMemoryFromKB(supabase);
        
        if (!memory) {
          memory = await fetchUnifiedMemory(supabase, { days: 90 });
        }

        const results = queryUnifiedMemory(memory, {
          type: request.query.type,
          params: request.query.params,
        });

        return json({
          query: request.query,
          results_count: results.length,
          results,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // HEALTH: Status check
      // ═══════════════════════════════════════════════════════════════
      case 'health': {
        const { data: cached } = await supabase
          .from('agent_memory_cache')
          .select('compiled_at, stats')
          .eq('memory_type', 'unified_memory')
          .maybeSingle();

        return json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          unified_memory: cached ? {
            last_updated: cached.compiled_at,
            stats: cached.stats,
          } : null,
          trio: {
            kb: 'Full unified memory in Knowledge Base',
            slice: 'Recent events for context injection',
            query: 'Precision tool for exact recall',
          },
          tool_definition: MEMORY_TOOL_DEFINITION,
        });
      }

      default:
        return json({ 
          error: `Unknown action: ${request.action}`,
          valid_actions: ['refresh', 'get_kb', 'slice', 'query', 'health']
        }, 400);
    }

  } catch (error) {
    console.error('[MemoryAgent] Error:', error);
    return json({ error: String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
