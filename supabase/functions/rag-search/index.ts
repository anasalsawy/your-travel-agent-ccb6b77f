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

// Generate embedding using OpenAI's text-embedding-3-small model
async function getEmbedding(text: string): Promise<number[]> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
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

    // Embed the query using OpenAI
    const queryEmbedding = await getEmbedding(request.query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const threshold = request.similarity_threshold ?? 0.3;  // Lower default for better recall
    const matchCount = request.match_count || 5;

    console.log(`[RAG Search] Threshold: ${threshold}, Match count: ${matchCount}`);

    // Use raw SQL to properly cast the vector and perform similarity search
    const { data: results, error } = await supabase.rpc('search_documents', {
      query_embedding: queryEmbedding,  // Pass as array, not string
      match_count: matchCount,
      similarity_threshold: threshold,
    });

    if (error) {
      console.error('[RAG Search] RPC error:', error);
      throw error;
    }

    const scoredResults = (results || []).map((r: any) => ({
      id: r.id,
      document_id: r.document_id,
      content: r.content,
      similarity: r.similarity,
      metadata: r.metadata || {},
    }));

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
