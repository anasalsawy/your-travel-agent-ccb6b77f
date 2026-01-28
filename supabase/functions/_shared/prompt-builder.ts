/**
 * PROMPT BUILDER - Unified Memory Injection for All Agents
 * 
 * Assembles the three-layer memory architecture into a single prompt:
 * 
 * 1. HOLISTIC (Always loaded) - Global Briefing narrative
 * 2. CONTEXT (Usually loaded) - Recent slice for user/site
 * 3. PRECISE (On-demand) - RAG results for specific queries
 * 
 * Usage:
 *   const prompt = await buildFullPrompt({
 *     supabase,
 *     userId: 'abc-123',
 *     sliceHours: 24,
 *     ragQuery: 'refund policy details',
 *     userMessage: 'What is your refund policy?'
 *   });
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAgentContext } from "./holistic-memory.ts";
import { 
  loadUnifiedMemoryFromKB, 
  fetchUnifiedMemory, 
  generateSlice 
} from "./unified-memory-core.ts";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface BuildPromptOptions {
  supabase: SupabaseClient;
  
  /** User ID for context slice (optional - if omitted, uses global slice) */
  userId?: string;
  
  /** Customer ID for customer-specific context (optional) */
  customerId?: string;
  
  /** Include holistic layer (default: true) */
  includeHolistic?: boolean;
  
  /** Hours to look back for context slice (default: 24) */
  sliceHours?: number;
  
  /** Max tokens for context slice (default: 800) */
  sliceMaxTokens?: number;
  
  /** RAG query for precise layer (optional - only loaded if provided) */
  ragQuery?: string;
  
  /** Max tokens for RAG results (default: 2000) */
  ragMaxTokens?: number;
  
  /** The user's message to include in prompt */
  userMessage?: string;
  
  /** Focus types for slice (e.g., ['quote', 'conversation']) */
  focusTypes?: string[];
}

export interface PromptResult {
  /** The fully assembled prompt string */
  prompt: string;
  
  /** Individual layer contents for inspection */
  layers: {
    holistic: string;
    context: string;
    precise: string;
  };
  
  /** Token estimates for each layer */
  tokenEstimates: {
    holistic: number;
    context: number;
    precise: number;
    total: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════

export async function buildFullPrompt(options: BuildPromptOptions): Promise<PromptResult> {
  const {
    supabase,
    userId,
    customerId,
    includeHolistic = true,
    sliceHours = 24,
    sliceMaxTokens = 800,
    ragQuery,
    ragMaxTokens = 2000,
    userMessage,
    focusTypes,
  } = options;

  // Track layers
  let holistic = '';
  let context = '';
  let precise = '';

  // ─────────────────────────────────────────────────────────────────
  // 1. HOLISTIC LAYER (Global Briefing)
  // ─────────────────────────────────────────────────────────────────
  if (includeHolistic) {
    try {
      holistic = await buildAgentContext(supabase, { includeHolistic: true }) || '';
    } catch (error) {
      console.error('[PromptBuilder] Holistic layer error:', error);
      holistic = '(Holistic memory unavailable)';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. CONTEXT LAYER (Recent Slice)
  // ─────────────────────────────────────────────────────────────────
  try {
    // Load unified memory from cache or fetch fresh
    let memory = await loadUnifiedMemoryFromKB(supabase);
    if (!memory) {
      memory = await fetchUnifiedMemory(supabase, { days: 14 });
    }

    // If userId or customerId provided, pre-filter memory events using structured matching
    if (userId || customerId) {
      const filteredEvents = memory.events.filter((e) => {
        const d = e.data || {};
        
        // Match by explicit IDs (structured field matching, not string search)
        if (userId && (d.user_id === userId || d.session_id === userId)) return true;
        if (customerId && (d.customer_id === customerId)) return true;
        
        // Match by email if available in data
        if (d.customer_email || d.contact_email) {
          // If we have email-based matching in the future, add here
        }
        
        // Include global/system events that aren't user-specific
        // These are events like system alerts, general notifications, etc.
        if (!d.user_id && !d.customer_id && !d.session_id) return true;
        
        return false;
      });
      
      // Create filtered memory for slice generation
      memory = {
        ...memory,
        events: filteredEvents,
        total_events: filteredEvents.length,
      };
    }

    // Generate slice from (optionally filtered) memory
    const sliceResult = generateSlice(memory, {
      hours: sliceHours,
      maxTokens: sliceMaxTokens,
      focusTypes,
    });

    context = sliceResult.content || '';
  } catch (error) {
    console.error('[PromptBuilder] Context layer error:', error);
    context = '(Recent context unavailable)';
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. PRECISE LAYER (RAG)
  // ─────────────────────────────────────────────────────────────────
  if (ragQuery) {
    try {
      const ragUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/rag-search`;
      
      const resp = await fetch(ragUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'get_context',
          query: ragQuery,
          match_count: 8,
          similarity_threshold: 0.35,
          max_tokens: ragMaxTokens,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        precise = data.context || '';
      } else {
        console.error('[PromptBuilder] RAG error:', await resp.text());
        precise = '(Precise search unavailable)';
      }
    } catch (error) {
      console.error('[PromptBuilder] RAG layer error:', error);
      precise = '(Precise search unavailable)';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // ASSEMBLE FINAL PROMPT
  // ─────────────────────────────────────────────────────────────────
  const prompt = assemblePrompt({
    holistic,
    context,
    precise,
    userMessage,
    sliceHours,
  });

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  return {
    prompt,
    layers: {
      holistic,
      context,
      precise,
    },
    tokenEstimates: {
      holistic: estimateTokens(holistic),
      context: estimateTokens(context),
      precise: estimateTokens(precise),
      total: estimateTokens(prompt),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

// (formatContextSlice removed - using generateSlice from unified-memory-core directly)

function assemblePrompt(parts: {
  holistic: string;
  context: string;
  precise: string;
  userMessage?: string;
  sliceHours: number;
}): string {
  const sections: string[] = [];

  // Holistic Layer
  if (parts.holistic) {
    sections.push(`
═══════════════════════════════════════════════════════════════════
🌐 HOLISTIC MEMORY (Global Understanding)
═══════════════════════════════════════════════════════════════════
${parts.holistic}
    `.trim());
  }

  // Context Layer
  if (parts.context) {
    sections.push(`
═══════════════════════════════════════════════════════════════════
🕒 RECENT CONTEXT (Last ${parts.sliceHours}h)
═══════════════════════════════════════════════════════════════════
${parts.context}
    `.trim());
  }

  // Precise Layer
  if (parts.precise) {
    sections.push(`
═══════════════════════════════════════════════════════════════════
📚 PRECISE CONTEXT (RAG Search Results)
═══════════════════════════════════════════════════════════════════
${parts.precise}
    `.trim());
  }

  // User Message
  if (parts.userMessage) {
    sections.push(`
═══════════════════════════════════════════════════════════════════
👤 USER MESSAGE
═══════════════════════════════════════════════════════════════════
${parts.userMessage}
    `.trim());
  }

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Quick helper for agents that just need holistic + context (no RAG)
 */
export async function buildQuickContext(
  supabase: SupabaseClient,
  options?: {
    userId?: string;
    sliceHours?: number;
  }
): Promise<string> {
  const result = await buildFullPrompt({
    supabase,
    userId: options?.userId,
    sliceHours: options?.sliceHours || 24,
    includeHolistic: true,
  });
  
  return result.prompt;
}

/**
 * Helper for precision queries (RAG only, no holistic/context)
 */
export async function buildPreciseContext(
  supabase: SupabaseClient,
  query: string,
  maxTokens = 2000
): Promise<string> {
  const result = await buildFullPrompt({
    supabase,
    includeHolistic: false,
    ragQuery: query,
    ragMaxTokens: maxTokens,
  });
  
  return result.layers.precise;
}
