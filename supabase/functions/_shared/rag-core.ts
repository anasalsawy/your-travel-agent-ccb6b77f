/**
 * RAG CORE - Shared utilities for RAG operations
 * 
 * Use this in agents to query the knowledge base before responding.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RAGResult {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface RAGContext {
  query: string;
  results_count: number;
  context: string;
  token_estimate: number;
}

/**
 * Generate embedding using OpenAI's text-embedding-3-small model
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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

/**
 * Search documents and return raw results
 */
export async function searchDocuments(
  supabase: SupabaseClient,
  query: string,
  apiKey: string,
  options: {
    matchCount?: number;
    similarityThreshold?: number;
  } = {}
): Promise<RAGResult[]> {
  const queryEmbedding = await getEmbedding(query, apiKey);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const { data, error } = await supabase.rpc('search_documents', {
    query_embedding: embeddingStr,
    match_count: options.matchCount || 5,
    similarity_threshold: options.similarityThreshold || 0.7,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Get formatted context string for agent injection
 */
export async function getRAGContext(
  supabase: SupabaseClient,
  query: string,
  apiKey: string,
  options: {
    matchCount?: number;
    similarityThreshold?: number;
    maxTokens?: number;
  } = {}
): Promise<RAGContext> {
  const results = await searchDocuments(supabase, query, apiKey, options);
  
  const maxChars = (options.maxTokens || 4000) * 4;
  let context = '📚 RELEVANT KNOWLEDGE:\n\n';
  let charCount = context.length;

  for (const result of results) {
    const chunk = `[Similarity: ${(result.similarity * 100).toFixed(1)}%]\n${result.content}\n\n---\n\n`;
    if (charCount + chunk.length > maxChars) break;
    context += chunk;
    charCount += chunk.length;
  }

  if (!results.length) {
    context += '(No relevant documents found for this query)\n';
  }

  return {
    query,
    results_count: results.length,
    context,
    token_estimate: Math.ceil(charCount / 4),
  };
}

/**
 * RAG tool definition for LLM agents
 */
export const RAG_TOOL_DEFINITION = {
  name: 'knowledge_search',
  description: 'Search the knowledge base for relevant information. Use for policy questions, procedures, or any documented knowledge.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query',
      },
      match_count: {
        type: 'number',
        description: 'Number of results to return (default: 5)',
      },
    },
    required: ['query'],
  },
};
