/**
 * RAG Embed - Embed and store documents for semantic search
 * 
 * Actions:
 * - embed_document: Chunk text, generate embeddings, store in pgvector
 * - delete_document: Remove document and its chunks
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbedRequest {
  action: 'embed_document' | 'delete_document';
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  document_id?: string;
}

// Simple text chunker with overlap
function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  const wordsPerChunk = maxTokens * 0.75; // ~0.75 words per token estimate
  
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    chunks.push(chunk);
    i += wordsPerChunk - overlap;
  }
  
  return chunks.filter(c => c.trim().length > 0);
}

// Generate embedding using a simple hash-based approach for now
// In production, you'd use OpenAI or Voyage embeddings
async function getEmbedding(text: string): Promise<number[]> {
  // Use a deterministic hash-based embedding for testing
  // This creates consistent 1536-dim vectors based on text content
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
  
  // Normalize the vector
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

    const request: EmbedRequest = await req.json();
    console.log(`[RAG Embed] Action: ${request.action}`);

    switch (request.action) {
      case 'embed_document': {
        if (!request.title || !request.content) {
          return json({ error: 'title and content are required' }, 400);
        }

        // 1. Create document record
        const { data: doc, error: docError } = await supabase
          .from('documents')
          .insert({
            title: request.title,
            content: request.content,
            source: request.source,
            metadata: request.metadata || {},
          })
          .select()
          .single();

        if (docError) throw docError;
        console.log(`[RAG Embed] Created document: ${doc.id}`);

        // 2. Chunk the content
        const chunks = chunkText(request.content);
        console.log(`[RAG Embed] Created ${chunks.length} chunks`);

        // 3. Embed and store each chunk
        const chunkRecords = [];
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await getEmbedding(chunks[i]);
          chunkRecords.push({
            document_id: doc.id,
            content: chunks[i],
            embedding: `[${embedding.join(',')}]`,
            chunk_index: i,
            token_count: Math.ceil(chunks[i].split(/\s+/).length * 1.3),
          });
        }

        const { error: chunksError } = await supabase
          .from('document_chunks')
          .insert(chunkRecords);

        if (chunksError) throw chunksError;
        console.log(`[RAG Embed] Stored ${chunkRecords.length} chunks`);

        return json({
          success: true,
          document_id: doc.id,
          chunks_created: chunkRecords.length,
        });
      }

      case 'delete_document': {
        if (!request.document_id) {
          return json({ error: 'document_id is required' }, 400);
        }

        // Cascade delete will remove chunks
        const { error } = await supabase
          .from('documents')
          .delete()
          .eq('id', request.document_id);

        if (error) throw error;

        return json({ success: true, deleted: request.document_id });
      }

      default:
        return json({ error: `Unknown action: ${request.action}` }, 400);
    }
  } catch (error) {
    console.error('[RAG Embed] Error:', error);
    return json({ error: String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
