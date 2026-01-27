/**
 * AGENT MEMORY INTEGRATION
 * 
 * This module provides the integration layer for agents to access
 * the 3-layer memory architecture:
 * 
 * 1. KNOWLEDGE BASE (Long-Term)
 *    - Holistic, background understanding
 *    - Retrieved via KB search
 *    - Updated by Memory Agent on demand
 * 
 * 2. SHORT-TERM MEMORY (Context Slice)
 *    - Recent events, active threads
 *    - Injected directly into agent context
 *    - Token-budgeted
 * 
 * 3. PRECISION MEMORY TOOL
 *    - Exact facts and receipts
 *    - Agent queries via memory_tool
 *    - Returns structured JSON
 * 
 * IMPORTANT:
 * - No cron jobs - memory is refreshed on-demand or event-triggered
 * - No hardcoding into prompt files
 * - All agents share the same unified memory sources
 */

import { MEMORY_TOOL_DEFINITION, executeMemoryTool, getShortTermMemorySlice, getKnowledgeBase } from "./memory-tool.ts";

// Re-export everything agents need
export { 
  MEMORY_TOOL_DEFINITION, 
  executeMemoryTool, 
  getShortTermMemorySlice, 
  getKnowledgeBase 
};

// ═══════════════════════════════════════════════════════════════════
// AGENT BEHAVIOR INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════

export const MEMORY_BEHAVIOR_INSTRUCTIONS = `
## Memory Access Guidelines

You have access to a 3-layer memory system:

### 1. Knowledge Base (Long-Term Background)
- Contains holistic understanding of the business: patterns, history, insights
- Use this for: "What's our typical customer profile?", "What routes are popular?", "What have we learned?"
- This is background awareness - not for precise facts

### 2. Short-Term Memory (Recent Context)
- You receive a context slice of recent events at the start of interactions
- Contains: pending items, active threads, recent events
- Keeps you "up to date" without overloading context

### 3. Precision Memory Tool (memory_tool)
- Use this when you need EXACT facts, receipts, or auditable data
- Examples: "What was the exact quote for customer X?", "When did order Y get delivered?"
- Returns structured JSON with all fields - nothing hidden

### When to Use What:
- Vague/general questions → Use your KB background knowledge
- "What just happened?" → Reference your short-term context
- Need exact details → Call memory_tool

### Rules:
- ALWAYS use memory_tool before making factual claims about specific events
- NEVER guess or hallucinate - if you're not sure, query the memory
- The memory is auditable - users can verify what you referenced
`;

// ═══════════════════════════════════════════════════════════════════
// AGENT CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════

interface AgentContextOptions {
  supabaseUrl: string;
  supabaseKey: string;
  
  // Short-term memory options
  includeShortTerm?: boolean;
  shortTermHours?: number;
  focusCustomerId?: string;
  
  // KB options (usually agents use KB search, but can include inline for small contexts)
  includeKbSummary?: boolean;
  
  // Add behavior instructions
  includeBehaviorInstructions?: boolean;
}

/**
 * Build complete agent context with memory layers
 */
export async function buildAgentMemoryContext(
  options: AgentContextOptions
): Promise<{
  shortTermContext: string | null;
  kbSummary: string | null;
  behaviorInstructions: string;
  toolDefinition: typeof MEMORY_TOOL_DEFINITION;
}> {
  const results: {
    shortTermContext: string | null;
    kbSummary: string | null;
    behaviorInstructions: string;
    toolDefinition: typeof MEMORY_TOOL_DEFINITION;
  } = {
    shortTermContext: null,
    kbSummary: null,
    behaviorInstructions: options.includeBehaviorInstructions !== false 
      ? MEMORY_BEHAVIOR_INSTRUCTIONS 
      : '',
    toolDefinition: MEMORY_TOOL_DEFINITION,
  };

  // Fetch short-term memory if requested
  if (options.includeShortTerm !== false) {
    try {
      const slice = await getShortTermMemorySlice(
        options.supabaseUrl,
        options.supabaseKey,
        {
          lookback_hours: options.shortTermHours || 48,
          format: 'text',
          focus_customer_id: options.focusCustomerId,
        }
      ) as { content?: string };
      
      if (slice.content) {
        results.shortTermContext = slice.content;
      }
    } catch (error) {
      console.error('[AgentMemory] Failed to fetch short-term memory:', error);
    }
  }

  // Fetch KB summary if requested (usually agents use KB search instead)
  if (options.includeKbSummary) {
    try {
      const kb = await getKnowledgeBase(
        options.supabaseUrl,
        options.supabaseKey,
        { refresh: false }
      ) as { content?: string };
      
      // Only include a brief summary, not the full KB
      if (kb.content) {
        // Extract just the first section for inline context
        const firstSection = kb.content.split('---')[0] || '';
        results.kbSummary = firstSection.substring(0, 2000) + '\n[...use KB search for more detail]';
      }
    } catch (error) {
      console.error('[AgentMemory] Failed to fetch KB:', error);
    }
  }

  return results;
}

/**
 * Format agent context as a single injectable string
 */
export function formatAgentContextString(context: Awaited<ReturnType<typeof buildAgentMemoryContext>>): string {
  const parts: string[] = [];

  if (context.behaviorInstructions) {
    parts.push(context.behaviorInstructions);
  }

  if (context.kbSummary) {
    parts.push('\n═══ KNOWLEDGE BASE SUMMARY ═══\n' + context.kbSummary);
  }

  if (context.shortTermContext) {
    parts.push('\n' + context.shortTermContext);
  }

  return parts.join('\n');
}
