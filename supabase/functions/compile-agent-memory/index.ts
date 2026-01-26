/**
 * COMPILE AGENT MEMORY - Cron Job Function
 * 
 * HYBRID ARCHITECTURE:
 * 1. Compiles business activity from DB
 * 2. Stores in agent_memory_cache for conversation-start fetch
 * 3. Triggers Claude Manager to write memory into prompt files via GitHub
 * 
 * Result: Memory is BOTH cached in DB AND hardcoded in source files.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchActivitySummary, formatActivityMemoryPrompt, fetchDetailedActivityLog } from "../_shared/activity-memory.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[compile-agent-memory] Starting memory compilation...');

  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Compile memory from database
    // ═══════════════════════════════════════════════════════════════════
    const shortTermSummary = await fetchActivitySummary(supabaseUrl, supabaseKey, 14);
    const shortTermContent = formatActivityMemoryPrompt(shortTermSummary);
    const longTermContent = await fetchDetailedActivityLog(supabaseUrl, supabaseKey, 90);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Store in cache table (for conversation-start fetch)
    // ═══════════════════════════════════════════════════════════════════
    const { error: shortTermError } = await supabase
      .from('agent_memory_cache')
      .upsert({
        memory_type: 'short_term',
        compiled_content: shortTermContent,
        stats: {
          conversations: shortTermSummary.conversations.total,
          quotes: shortTermSummary.quotes.total,
          orders: shortTermSummary.orders.total,
          revenue: shortTermSummary.orders.total_revenue,
          period_days: 14,
        },
        compiled_at: new Date().toISOString(),
      }, { onConflict: 'memory_type' });

    if (shortTermError) {
      console.error('[compile-agent-memory] Short-term upsert error:', shortTermError);
      throw shortTermError;
    }

    const { error: longTermError } = await supabase
      .from('agent_memory_cache')
      .upsert({
        memory_type: 'long_term',
        compiled_content: longTermContent,
        stats: { period_days: 90 },
        compiled_at: new Date().toISOString(),
      }, { onConflict: 'memory_type' });

    if (longTermError) {
      console.error('[compile-agent-memory] Long-term upsert error:', longTermError);
      throw longTermError;
    }

    console.log('[compile-agent-memory] Cache updated successfully');
    console.log(`  - Short-term: ${shortTermContent.length} chars`);
    console.log(`  - Long-term: ${longTermContent.length} chars`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Trigger Claude to update prompt files via GitHub
    // ═══════════════════════════════════════════════════════════════════
    const updatePromptFilesMessage = `
UPDATE AGENT MEMORY IN CODE FILES

The memory cache has been refreshed. Update the hardcoded memory blocks in these files:

1. src/lib/maya-voice-prompt.ts - Update the "BUSINESS ACTIVITY MEMORY" section
2. src/lib/maya-customer-prompt.ts - Update the "BUSINESS ACTIVITY MEMORY" section  
3. public/maya-voice-prompt.txt - Update the "BUSINESS ACTIVITY MEMORY" section

NEW MEMORY CONTENT TO INSERT:
\`\`\`
${shortTermContent}
\`\`\`

Use your github_write_file tool to:
1. Read each file
2. Find the section between "BUSINESS ACTIVITY MEMORY" and the next major section
3. Replace it with the new content above
4. Commit with message: "chore: auto-update agent memory [${new Date().toISOString().split('T')[0]}]"

This is an automated memory refresh - execute immediately.
`;

    // Call Claude Manager to update the files
    const claudeResponse = await supabase.functions.invoke('claude-agent', {
      body: {
        message: updatePromptFilesMessage,
        channel: 'system',
        context: { type: 'memory_refresh', automated: true }
      }
    });

    if (claudeResponse.error) {
      console.error('[compile-agent-memory] Claude update error:', claudeResponse.error);
      // Don't throw - cache was updated successfully, GitHub update is bonus
    } else {
      console.log('[compile-agent-memory] Claude triggered for GitHub update');
    }

    return new Response(JSON.stringify({
      success: true,
      compiled_at: new Date().toISOString(),
      short_term_chars: shortTermContent.length,
      long_term_chars: longTermContent.length,
      github_update_triggered: !claudeResponse.error,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[compile-agent-memory] Error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
