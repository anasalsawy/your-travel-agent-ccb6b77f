/**
 * MEMORY CACHE READER
 * 
 * Simple utility to read pre-compiled memory from cache.
 * This is what agents use - no heavy queries, just read cached text.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CachedMemory {
  shortTerm: string;
  longTerm: string;
  compiledAt: string | null;
}

/**
 * Read pre-compiled memory from cache table.
 * Falls back to empty strings if cache is not yet populated.
 */
export async function getCachedMemory(
  supabaseUrl: string,
  supabaseKey: string
): Promise<CachedMemory> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('agent_memory_cache')
    .select('memory_type, compiled_content, compiled_at')
    .in('memory_type', ['short_term', 'long_term']);

  if (error) {
    console.error('[memory-cache] Error reading cache:', error);
    return { shortTerm: '', longTerm: '', compiledAt: null };
  }

  const shortTermRow = data?.find(r => r.memory_type === 'short_term');
  const longTermRow = data?.find(r => r.memory_type === 'long_term');

  return {
    shortTerm: shortTermRow?.compiled_content || '',
    longTerm: longTermRow?.compiled_content || '',
    compiledAt: shortTermRow?.compiled_at || longTermRow?.compiled_at || null,
  };
}

/**
 * Build unified memory section for prompt injection.
 * Returns empty string if cache is empty.
 */
export async function getMemoryForPrompt(
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  const cached = await getCachedMemory(supabaseUrl, supabaseKey);
  
  if (!cached.shortTerm && !cached.longTerm) {
    console.log('[memory-cache] Cache empty - no memory to inject');
    return '';
  }

  const sections: string[] = [];
  
  if (cached.shortTerm) {
    sections.push(cached.shortTerm);
  }
  
  if (cached.longTerm) {
    sections.push(cached.longTerm);
  }

  if (cached.compiledAt) {
    const compiledDate = new Date(cached.compiledAt);
    const minutesAgo = Math.round((Date.now() - compiledDate.getTime()) / 60000);
    sections.push(`\n📍 Memory snapshot from ${minutesAgo} minutes ago`);
  }

  return sections.join('\n\n');
}
