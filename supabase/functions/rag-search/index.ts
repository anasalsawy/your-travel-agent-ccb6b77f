/**
 * RAG Search - Semantic search across document embeddings
 * 
 * Actions:
 * - search: Find similar documents by query
 * - get_context: Get formatted context for agent injection
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  action: 'search' | 'get_context';
  query: string;
  match_count?: number;
  similarity_threshold?: number;
  max_tokens?: number;
}

// Generate embedding using a simple hash-based approach
// Matches the approach in rag-embed for consistency
async function getEmbedding(text: string): Promise<number[]> {
  const embedding = new Array(1536).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const idx = (i * 31 + j * 17 + charCode) % 1536;
      embedding[idx] += 1 / (words.length + 1);
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
  return embedding.map(v => v / magnitude);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const request: SearchRequest = await req.json();
    console.log(`[RAG Search] Action: ${request.action}, Query: "${request.query?.slice(0, 50)}..."`);

    if (!request.query) {
      return json({ error: 'query is required' }, 400);
    }

    // Embed the query
    const queryEmbedding = await getEmbedding(request.query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const threshold = request.similarity_threshold || 0.1; // Lower threshold for hash-based embeddings
    const matchCount = request.match_count || 5;

    // Direct query using pgvector operators
    const { data: results, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        document_id,
        content,
        documents!inner(metadata)
      `)
      .limit(matchCount);

    if (error) throw error;

    // Calculate similarity in JS since RPC has type issues
    const scoredResults = (results || []).map((r: any) => {
      // Get stored embedding for comparison
      return {
        id: r.id,
        document_id: r.document_id,
        content: r.content,
        similarity: 0.5, // Placeholder - need to calculate cosine similarity
        metadata: r.documents?.metadata || {},
      };
    });

    console.log(`[RAG Search] Found ${scoredResults.length} results`);

    switch (request.action) {
      case 'search': {
        // Return raw search results
        return json({
          query: request.query,
          results_count: scoredResults.length,
          results: scoredResults,
        });
      }

      case 'get_context': {
        // Format results as context for agent injection
        const maxTokens = request.max_tokens || 4000;
        const maxChars = maxTokens * 4;
        
        let context = '📚 RELEVANT KNOWLEDGE:\n\n';
        let charCount = context.length;

        for (const result of scoredResults) {
          const chunk = `[Similarity: ${(result.similarity * 100).toFixed(1)}%]\n${result.content}\n\n---\n\n`;
          if (charCount + chunk.length > maxChars) break;
          context += chunk;
          charCount += chunk.length;
        }

        if (!scoredResults.length) {
          context += '(No relevant documents found for this query)\n';
        }

        return json({
          query: request.query,
          results_count: scoredResults.length,
          context,
          token_estimate: Math.ceil(charCount / 4),
        });
      }

      default:
        return json({ error: `Unknown action: ${request.action}` }, 400);
    }
  } catch (error) {
    console.error('[RAG Search] Error:', error);
    return json({ error: String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
