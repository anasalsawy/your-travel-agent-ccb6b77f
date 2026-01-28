/**
 * MEMORY AGENT - Anas Memory Trio Orchestrator
 * 
 * THREE-LAYER MEMORY ARCHITECTURE:
 * 
 * 1. HOLISTIC (Global Briefing)
 *    - Standing narrative understanding of the entire business
 *    - Injected into EVERY agent prompt automatically
 *    - Updated periodically via 'refresh_holistic' action
 * 
 * 2. CONTEXT (Short-term Slice)
 *    - Recent events (24-48h) for immediate awareness
 *    - Token-budgeted, deterministic
 *    - Generated on-demand via 'slice' action
 * 
 * 3. PRECISE (Query/RAG)
 *    - Exact factual recall via 'query' action
 *    - Semantic search via rag-search edge function
 *    - Returns raw JSON - no summarization
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
import {
  generateGlobalBriefing,
  saveGlobalBriefing,
  loadGlobalBriefing,
  buildAgentContext,
} from "../_shared/holistic-memory.ts";

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
  | 'refresh'           // Refresh unified memory in KB
  | 'refresh_holistic'  // Refresh Global Briefing (holistic layer)
  | 'get_kb'            // Get full KB memory
  | 'get_briefing'      // Get holistic Global Briefing
  | 'get_context'       // Get combined agent context (holistic + slice)
  | 'slice'             // Get context slice
  | 'query'             // Precision query
  | 'health';           // Health check

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
  
  // For 'refresh' and 'refresh_holistic'
  refresh_options?: {
    days?: number;
  };
  
  // For 'get_context'
  context_options?: {
    include_holistic?: boolean;
    slice_hours?: number;
    slice_max_tokens?: number;
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
          action: 'refresh',
          events_count: memory.total_events,
          period: memory.period,
          duration_ms: duration,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // REFRESH_HOLISTIC: Update Global Briefing (Holistic Layer)
      // ═══════════════════════════════════════════════════════════════
      case 'refresh_holistic': {
        const days = request.refresh_options?.days || 90;
        const startTime = Date.now();
        
        // Fetch unified memory first
        let memory = await loadUnifiedMemoryFromKB(supabase);
        if (!memory) {
          console.log('[MemoryAgent] No cached memory, fetching fresh...');
          memory = await fetchUnifiedMemory(supabase, { days });
          await saveUnifiedMemoryToKB(supabase, memory);
        }
        
        // Generate Global Briefing
        const briefing = await generateGlobalBriefing(supabase, memory);
        
        // Save to cache
        await saveGlobalBriefing(supabase, briefing);
        
        const duration = Date.now() - startTime;
        console.log(`[MemoryAgent] Holistic refreshed: ${briefing.narrative.length} chars in ${duration}ms`);

        return json({
          success: true,
          action: 'refresh_holistic',
          narrative_length: briefing.narrative.length,
          historical: briefing.historical,
          recent_summary: briefing.recent.summary,
          active_issues: briefing.recent.active_issues.length,
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
      // GET_BRIEFING: Return holistic Global Briefing
      // ═══════════════════════════════════════════════════════════════
      case 'get_briefing': {
        let briefing = await loadGlobalBriefing(supabase);
        
        // If no cached briefing, generate fresh
        if (!briefing) {
          console.log('[MemoryAgent] No cached briefing, generating fresh...');
          let memory = await loadUnifiedMemoryFromKB(supabase);
          if (!memory) {
            memory = await fetchUnifiedMemory(supabase, { days: 90 });
            await saveUnifiedMemoryToKB(supabase, memory);
          }
          const newBriefing = await generateGlobalBriefing(supabase, memory);
          await saveGlobalBriefing(supabase, newBriefing);
          briefing = newBriefing.narrative;
        }

        return json({
          source: briefing ? 'cache' : 'fresh',
          narrative: briefing,
          character_count: briefing?.length || 0,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // GET_CONTEXT: Combined agent context (Holistic + Slice)
      // ═══════════════════════════════════════════════════════════════
      case 'get_context': {
        const opts = request.context_options || {};
        
        // Get holistic briefing
        const holistic = opts.include_holistic !== false 
          ? await buildAgentContext(supabase, { includeHolistic: true })
          : '';
        
        // Get recent slice
        let slice = '';
        if (opts.slice_hours) {
          let memory = await loadUnifiedMemoryFromKB(supabase);
          if (!memory) {
            memory = await fetchUnifiedMemory(supabase, { days: 14 });
          }
          const sliceResult = generateSlice(memory, {
            hours: opts.slice_hours,
            maxTokens: opts.slice_max_tokens || 4000,
          });
          slice = sliceResult.content;
        }
        
        const combined = [holistic, slice].filter(Boolean).join('\n\n');
        
        return json({
          holistic_length: holistic.length,
          slice_length: slice.length,
          combined_length: combined.length,
          context: combined,
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
      // HEALTH: Status check with architecture overview
      // ═══════════════════════════════════════════════════════════════
      case 'health': {
        const { data: cached } = await supabase
          .from('agent_memory_cache')
          .select('memory_type, compiled_at, stats')
          .in('memory_type', ['unified_memory', 'global_briefing']);

        const unifiedCache = cached?.find(c => c.memory_type === 'unified_memory');
        const briefingCache = cached?.find(c => c.memory_type === 'global_briefing');

        return json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          
          architecture: {
            layer_1_holistic: {
              name: 'Global Briefing',
              purpose: 'Standing narrative understanding - always injected',
              last_updated: briefingCache?.compiled_at || null,
              stats: briefingCache?.stats || null,
            },
            layer_2_context: {
              name: 'Short-term Slice',
              purpose: 'Recent events (24-48h) for immediate awareness',
              action: 'slice',
            },
            layer_3_precise: {
              name: 'Query/RAG',
              purpose: 'Exact factual recall and semantic search',
              tools: ['query (unified memory)', 'rag-search (semantic)'],
            },
          },
          
          unified_memory: unifiedCache ? {
            last_updated: unifiedCache.compiled_at,
            stats: unifiedCache.stats,
          } : null,
          
          available_actions: [
            'refresh - Update unified memory',
            'refresh_holistic - Update Global Briefing',
            'get_kb - Full unified memory',
            'get_briefing - Holistic narrative',
            'get_context - Combined holistic + slice',
            'slice - Recent events',
            'query - Precision queries',
            'health - This status',
          ],
          
          tool_definition: MEMORY_TOOL_DEFINITION,
        });
      }

      default:
        return json({ 
          error: `Unknown action: ${request.action}`,
          valid_actions: ['refresh', 'refresh_holistic', 'get_kb', 'get_briefing', 'get_context', 'slice', 'query', 'health']
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
