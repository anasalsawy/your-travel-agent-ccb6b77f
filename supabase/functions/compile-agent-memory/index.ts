/**
 * COMPILE AGENT MEMORY - Cron Job Function
 * 
 * Runs on schedule to compile and cache business activity logs.
 * Agents read from this cache - memory is always available, pre-compiled.
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
    // Compile short-term memory (2 weeks)
    const shortTermSummary = await fetchActivitySummary(supabaseUrl, supabaseKey, 14);
    const shortTermContent = formatActivityMemoryPrompt(shortTermSummary);
    
    // Compile long-term memory (90 days)
    const longTermContent = await fetchDetailedActivityLog(supabaseUrl, supabaseKey, 90);

    // Upsert short-term memory
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

    // Upsert long-term memory
    const { error: longTermError } = await supabase
      .from('agent_memory_cache')
      .upsert({
        memory_type: 'long_term',
        compiled_content: longTermContent,
        stats: {
          period_days: 90,
        },
        compiled_at: new Date().toISOString(),
      }, { onConflict: 'memory_type' });

    if (longTermError) {
      console.error('[compile-agent-memory] Long-term upsert error:', longTermError);
      throw longTermError;
    }

    console.log('[compile-agent-memory] Memory compilation complete!');
    console.log(`  - Short-term: ${shortTermContent.length} chars`);
    console.log(`  - Long-term: ${longTermContent.length} chars`);

    return new Response(JSON.stringify({
      success: true,
      compiled_at: new Date().toISOString(),
      short_term_chars: shortTermContent.length,
      long_term_chars: longTermContent.length,
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
