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

interface SearchResult {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
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

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Parse vector string from postgres format "[0.1,0.2,...]" to number array
function parseVector(vectorStr: string): number[] {
  if (!vectorStr) return [];
  const cleaned = vectorStr.replace(/[\[\]]/g, '');
  return cleaned.split(',').map(Number);
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
    const threshold = request.similarity_threshold ?? 0.3;
    const matchCount = request.match_count || 5;

    console.log(`[RAG Search] Embedding generated (${queryEmbedding.length} dims), threshold: ${threshold}`);

    // Fetch all chunks with their embeddings (for small datasets)
    // For large datasets, this should use pgvector's native search
    const { data: chunks, error } = await supabase
      .from('document_chunks')
      .select(`
        id,
        document_id,
        content,
        embedding,
        documents(metadata)
      `)
      .not('embedding', 'is', null);

    if (error) {
      console.error('[RAG Search] Query error:', error);
      throw error;
    }

    console.log(`[RAG Search] Fetched ${chunks?.length || 0} chunks`);

    // Calculate similarity for each chunk
    const scoredResults: SearchResult[] = [];
    
    for (const chunk of (chunks || [])) {
      const chunkEmbedding = parseVector(chunk.embedding);
      if (chunkEmbedding.length !== 1536) continue;
      
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      if (similarity >= threshold) {
        scoredResults.push({
          id: chunk.id,
          document_id: chunk.document_id,
          content: chunk.content,
          similarity,
          metadata: (chunk.documents as any)?.metadata || {},
        });
      }
    }

    // Sort by similarity descending and take top N
    scoredResults.sort((a, b) => b.similarity - a.similarity);
    const topResults = scoredResults.slice(0, matchCount);

    console.log(`[RAG Search] Found ${topResults.length} results above threshold ${threshold}`);

    switch (request.action) {
      case 'search': {
        return json({
          query: request.query,
          results_count: topResults.length,
          results: topResults,
        });
      }

      case 'get_context': {
        const maxTokens = request.max_tokens || 4000;
        const maxChars = maxTokens * 4;
        
        let context = '📚 RELEVANT KNOWLEDGE:\n\n';
        let charCount = context.length;

        for (const result of topResults) {
          const chunk = `[Similarity: ${(result.similarity * 100).toFixed(1)}%]\n${result.content}\n\n---\n\n`;
          if (charCount + chunk.length > maxChars) break;
          context += chunk;
          charCount += chunk.length;
        }

        if (!topResults.length) {
          context += '(No relevant documents found for this query)\n';
        }

        return json({
          query: request.query,
          results_count: topResults.length,
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
