-- Fix search_documents RPC to accept TEXT and cast to vector internally
-- This resolves the type mismatch between Edge Function arrays and pgvector

DROP FUNCTION IF EXISTS public.search_documents(vector, integer, double precision);
DROP FUNCTION IF EXISTS public.search_documents(text, integer, double precision);

CREATE OR REPLACE FUNCTION public.search_documents(
  query_embedding TEXT,
  match_count INTEGER DEFAULT 5,
  similarity_threshold DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  similarity DOUBLE PRECISION,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_vector vector(1536);
BEGIN
  -- Cast the TEXT input to vector
  query_vector := query_embedding::vector(1536);
  
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_vector) AS similarity,
    COALESCE(d.metadata, '{}'::jsonb) AS metadata
  FROM document_chunks dc
  LEFT JOIN documents d ON d.id = dc.document_id
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_vector) >= similarity_threshold
  ORDER BY dc.embedding <=> query_vector
  LIMIT match_count;
END;
$$;