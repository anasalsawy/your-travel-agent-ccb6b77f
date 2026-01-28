/**
 * MAYA DYNAMIC PROMPT BUILDER
 * 
 * Builds Maya's prompt dynamically based on:
 * 1. Base prompt (customer or voice)
 * 2. Customer-specific memory (if known customer)
 * 3. Active global learnings
 * 4. Prompt adaptations
 * 5. PRE-COMPILED MEMORY CACHE (auto-updated by cron, always available)
 * 
 * Memory is NOT fetched per-conversation. It's pre-compiled and cached.
 * Agents read from cache - memory is "hard coded" into every prompt.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CustomerMemory {
  preferred_tone?: string;
  response_style?: string;
  preferred_airlines?: string[];
  preferred_cabin_class?: string;
  typical_destinations?: string[];
  common_objections?: string[];
  what_works?: string[];
  what_failed?: string[];
  rapport_level?: number;
  trust_level?: number;
  booking_history_count?: number;
  total_spend?: number;
  key_facts?: any;
}

interface GlobalLearning {
  learning_type: string;
  title: string;
  description: string;
  example?: string;
  success_rate?: number;
  applies_to?: string[];
}

interface PromptAdaptation {
  adaptation_type: string;
  content: string;
  priority: number;
}

interface DynamicPromptData {
  customer_memory?: CustomerMemory;
  global_learnings: GlobalLearning[];
  prompt_adaptations: PromptAdaptation[];
  activity_memory?: {
    short_term: string; // Last 2 weeks - injected into system prompt
    long_term: string;  // All time - available for deep context
  };
}

/**
 * Fetch dynamic prompt data for a customer (including activity memory)
 */
export async function fetchDynamicPromptData(
  supabaseUrl: string,
  supabaseKey: string,
  customerId?: string,
  channel?: string,
  includeActivityMemory: boolean = true
): Promise<DynamicPromptData> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const result: DynamicPromptData = {
    global_learnings: [],
    prompt_adaptations: [],
  };

  // Parallel fetch all data sources using async wrappers
  const fetchCustomerMemory = async () => {
    if (customerId) {
      const { data } = await supabase
        .from("maya_customer_memory")
        .select("*")
        .eq("customer_id", customerId)
        .single();
      if (data) result.customer_memory = data as CustomerMemory;
    }
  };

  const fetchLearnings = async () => {
    const { data } = await supabase
      .from("maya_global_learnings")
      .select("learning_type, title, description, example, success_rate, applies_to")
      .eq("is_active", true)
      .gte("confidence_score", 6)
      .order("success_rate", { ascending: false })
      .limit(10);
    if (data) result.global_learnings = data as GlobalLearning[];
  };

  const fetchAdaptations = async () => {
    const { data } = await supabase
      .from("maya_prompt_adaptations")
      .select("adaptation_type, content, priority")
      .eq("is_active", true)
      .or(`scope.eq.global,scope_id.eq.${customerId || 'none'},scope_id.eq.${channel || 'none'}`)
      .order("priority", { ascending: false })
      .limit(20);
    if (data) result.prompt_adaptations = data as PromptAdaptation[];
  };

  const fetchActivityMemoryData = async () => {
    if (!includeActivityMemory) return;
    
    try {
      // Fetch pre-compiled memory from cache
      const { data: cacheData } = await supabase
        .from("agent_memory_cache")
        .select("memory_type, compiled_content")
        .in("memory_type", ["short_term", "long_term"]);
      
      if (cacheData && cacheData.length > 0) {
        const shortTerm = cacheData.find(c => c.memory_type === "short_term");
        const longTerm = cacheData.find(c => c.memory_type === "long_term");
        
        result.activity_memory = {
          short_term: shortTerm?.compiled_content || "",
          long_term: longTerm?.compiled_content || "",
        };
        console.log(`[Dynamic Prompt] Loaded cached memory: short=${shortTerm?.compiled_content?.length || 0} chars, long=${longTerm?.compiled_content?.length || 0} chars`);
      }
    } catch (error) {
      console.error("[Dynamic Prompt] Error fetching cached memory:", error);
    }
  };

  await Promise.all([
    fetchCustomerMemory(),
    fetchLearnings(),
    fetchAdaptations(),
    fetchActivityMemoryData(),
  ]);

  return result;
}

/**
 * Build a dynamic prompt section from the fetched data
 * NOTE: Activity memory is handled separately by buildUnifiedMemorySection
 * This only builds customer intelligence, learnings, and adaptations
 */
export function buildDynamicPromptSection(data: DynamicPromptData): string {
  const sections: string[] = [];

  // SKIP activity memory here - it's handled by buildUnifiedMemorySection with proper truncation
  // Previously this was duplicating memory without truncation!
  // REMOVED: Direct short_term injection here was causing 500K+ char prompts!
  // Activity memory is now ONLY added via buildUnifiedMemorySection with truncation

  // Customer Memory Section
  if (data.customer_memory) {
    const mem = data.customer_memory;
    sections.push(`
═══════════════════════════════════════════════════════════════════
CUSTOMER INTELLIGENCE (Use this to personalize!)
═══════════════════════════════════════════════════════════════════

${mem.preferred_tone ? `Communication Style: ${mem.preferred_tone}` : ''}
${mem.response_style ? `Decision Style: ${mem.response_style}` : ''}
${mem.preferred_airlines?.length ? `Preferred Airlines: ${mem.preferred_airlines.join(', ')}` : ''}
${mem.preferred_cabin_class ? `Preferred Class: ${mem.preferred_cabin_class}` : ''}
${mem.typical_destinations?.length ? `Favorite Destinations: ${mem.typical_destinations.join(', ')}` : ''}
${mem.booking_history_count ? `Previous Bookings: ${mem.booking_history_count} (Total spend: $${mem.total_spend})` : ''}
${mem.rapport_level ? `Relationship Level: ${mem.rapport_level}/10` : ''}

${mem.what_works?.length ? `✅ WHAT WORKS WITH THIS CUSTOMER:\n${mem.what_works.map(w => `  - ${w}`).join('\n')}` : ''}
${mem.what_failed?.length ? `❌ WHAT TO AVOID:\n${mem.what_failed.map(f => `  - ${f}`).join('\n')}` : ''}
${mem.common_objections?.length ? `⚠️ COMMON OBJECTIONS:\n${mem.common_objections.map(o => `  - ${o}`).join('\n')}` : ''}
${mem.key_facts ? `📝 KEY FACTS: ${typeof mem.key_facts === 'string' ? mem.key_facts : JSON.stringify(mem.key_facts)}` : ''}
`.trim());
  }

  // Global Learnings Section
  if (data.global_learnings.length > 0) {
    const learningsText = data.global_learnings.map(l => {
      let text = `• ${l.title}: ${l.description}`;
      if (l.example) text += `\n  Example: "${l.example}"`;
      if (l.success_rate && l.success_rate > 70) text += ` (${Math.round(l.success_rate)}% success rate)`;
      return text;
    }).join('\n\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════
PROVEN TACTICS (Learned from past success)
═══════════════════════════════════════════════════════════════════

${learningsText}
`.trim());
  }

  // Prompt Adaptations Section
  if (data.prompt_adaptations.length > 0) {
    const warnings = data.prompt_adaptations.filter(a => a.adaptation_type === 'add_warning');
    const examples = data.prompt_adaptations.filter(a => a.adaptation_type === 'add_example');
    const instructions = data.prompt_adaptations.filter(a => 
      a.adaptation_type === 'add_instruction' || a.adaptation_type === 'modify_tone'
    );

    let adaptText = '';
    
    if (warnings.length > 0) {
      adaptText += `🚨 RECENT WARNINGS:\n${warnings.map(w => `  - ${w.content}`).join('\n')}\n\n`;
    }
    
    if (examples.length > 0) {
      adaptText += `✨ RECENT SUCCESSES TO REPLICATE:\n${examples.map(e => `  - ${e.content}`).join('\n')}\n\n`;
    }
    
    if (instructions.length > 0) {
      adaptText += `📋 ADDITIONAL INSTRUCTIONS:\n${instructions.map(i => `  - ${i.content}`).join('\n')}`;
    }

    if (adaptText) {
      sections.push(`
═══════════════════════════════════════════════════════════════════
REAL-TIME COACHING NOTES
═══════════════════════════════════════════════════════════════════

${adaptText.trim()}
`.trim());
    }
  }

  return sections.join('\n\n');
}

/**
 * Truncate text to approximate token limit
 * ~4 chars per token, so 50K tokens ≈ 200K chars
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n... [Memory truncated for context limit]';
}

/**
 * Build UNIFIED MEMORY section - AGGRESSIVE token limits to prevent rate limits
 * 
 * ULTRA-CONSERVATIVE Budget (GPT-4o has 128K context, but rate limits hit fast):
 * - Base prompt + tools: ~20K tokens
 * - Conversation history: ~50K tokens (PRIORITY - what user just said!)
 * - Short-term memory: 5K tokens max (only most recent events)
 * - Long-term memory: DISABLED to save tokens
 * - Buffer: ~20K tokens
 * 
 * Total memory budget: ~5K tokens (20K chars) - MINIMAL to avoid rate limits
 */
function buildUnifiedMemorySection(data: DynamicPromptData): string {
  // ONLY short-term memory, heavily truncated
  // Long-term memory DISABLED to prevent rate limit issues
  if (data.activity_memory?.short_term) {
    // 5K tokens = ~20K chars - only the most recent activity
    const truncatedShort = truncateToTokenLimit(data.activity_memory.short_term, 5000);
    console.log(`[Dynamic Prompt] Memory after truncation: ${truncatedShort.length} chars`);
    return truncatedShort;
  }

  return '';
}

/**
 * Get the full enhanced prompt with ALL memory directly injected
 * 
 * UNIFIED MEMORY SYSTEM:
 * - Short-term (2 weeks): Real-time business awareness
 * - Long-term (90 days): Historical patterns and coaching insights
 * - Customer memory: Individual preferences and history
 * - Global learnings: Proven tactics from past success
 * 
 * ALL of this is DIRECTLY INJECTED into the system prompt.
 * There are NO separate query endpoints - it's all in the agent's mind.
 */
export async function getEnhancedPrompt(
  basePrompt: string,
  supabaseUrl: string,
  supabaseKey: string,
  customerId?: string,
  channel?: string,
  includeActivityMemory: boolean = true
): Promise<string> {
  try {
    const data = await fetchDynamicPromptData(supabaseUrl, supabaseKey, customerId, channel, includeActivityMemory);
    
    // Build all memory sections
    const unifiedMemory = buildUnifiedMemorySection(data);
    const customerIntelligence = buildDynamicPromptSection(data); // Customer + learnings + adaptations
    
    // Combine all sections
    const allMemorySections = [unifiedMemory, customerIntelligence].filter(Boolean).join('\n\n');
    
    let enhancedPrompt = basePrompt;
    
    if (allMemorySections) {
      // Insert ALL memory before the first major section break
      const insertPoint = basePrompt.indexOf('═══════════════');
      if (insertPoint > 0) {
        enhancedPrompt = basePrompt.slice(0, insertPoint) + allMemorySections + '\n\n' + basePrompt.slice(insertPoint);
      } else {
        // If no section break found, append at the end
        enhancedPrompt = basePrompt + '\n\n' + allMemorySections;
      }
    }
    
    console.log(`[Dynamic Prompt] Unified memory injected: ${allMemorySections.length} chars of context`);
    return enhancedPrompt;
  } catch (error) {
    console.error("[Dynamic Prompt] Error fetching memory data:", error);
    return basePrompt; // Fall back to base prompt on error
  }
}
