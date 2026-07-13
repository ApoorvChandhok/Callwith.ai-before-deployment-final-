-- ============================================================================
-- Migration: Dynamic RAG via pgvector
-- Enables vector search for knowledge base chunks using Gemini embeddings.
-- ============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge Base documents (one row per uploaded file)
CREATE TABLE IF NOT EXISTS public.knowledge_base_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('inbound', 'outbound')),
  file_name     TEXT NOT NULL,
  file_type     TEXT,                    -- 'pdf', 'docx', 'txt', 'csv', 'md'
  total_chars   INTEGER DEFAULT 0,
  chunk_count   INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Knowledge Base chunks with embeddings (768-dim for Gemini text-embedding-004)
CREATE TABLE IF NOT EXISTS public.knowledge_base_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES public.knowledge_base_documents(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,       -- order within document
  content       TEXT NOT NULL,           -- the chunk text
  token_count   INTEGER DEFAULT 0,
  embedding     vector(768),             -- Gemini text-embedding-004 output
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_kb_docs_business
  ON public.knowledge_base_documents(business_id, mode);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_business
  ON public.knowledge_base_chunks(business_id, mode);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_document
  ON public.knowledge_base_chunks(document_id);

-- 5. HNSW index for fast approximate nearest neighbor search
-- Using cosine distance (operator <=>), m=16, ef_construction=64
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON public.knowledge_base_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 6. RPC function for vector search (security definer to bypass RLS safely)
CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  p_business_id UUID,
  p_mode TEXT,
  p_query_embedding vector(768),
  p_match_count INTEGER DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  content TEXT,
  similarity FLOAT,
  file_name TEXT,
  chunk_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    d.file_name,
    c.chunk_index
  FROM public.knowledge_base_chunks c
  JOIN public.knowledge_base_documents d ON d.id = c.document_id
  WHERE d.business_id = p_business_id
    AND c.mode = p_mode
    AND d.status = 'ready'
    AND 1 - (c.embedding <=> p_query_embedding) > p_similarity_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- 7. RLS policies
ALTER TABLE public.knowledge_base_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY "super_admin_kb_docs_all"
  ON public.knowledge_base_documents FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "super_admin_kb_chunks_all"
  ON public.knowledge_base_chunks FOR ALL
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Users can view docs of their business
CREATE POLICY "users_view_own_kb_docs"
  ON public.knowledge_base_documents FOR SELECT
  USING (business_id = public.get_user_business_id());

CREATE POLICY "users_view_own_kb_chunks"
  ON public.knowledge_base_chunks FOR SELECT
  USING (business_id = public.get_user_business_id());

-- Admins can manage KB
CREATE POLICY "admins_manage_kb_docs"
  ON public.knowledge_base_documents FOR ALL
  USING (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin')
  WITH CHECK (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin');

CREATE POLICY "admins_manage_kb_chunks"
  ON public.knowledge_base_chunks FOR ALL
  USING (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin')
  WITH CHECK (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin');

-- Service role bypass (tool gateway uses service role key)
CREATE POLICY "service_role_kb_docs"
  ON public.knowledge_base_documents TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_kb_chunks"
  ON public.knowledge_base_chunks TO service_role USING (true) WITH CHECK (true);

-- 8. Auto-update timestamps
CREATE TRIGGER update_kb_docs_updated_at
  BEFORE UPDATE ON public.knowledge_base_documents
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
