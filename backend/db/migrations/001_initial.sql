-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    image_url TEXT,
    news_source TEXT,
    news_title VARCHAR(512),
    status VARCHAR(32) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_review','changes_requested','approved','scheduled','published','rejected')),
    notion_page_id VARCHAR(64),
    linkedin_post_id VARCHAR(128),
    approved_by VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ
);

-- KPIs table
CREATE TABLE IF NOT EXISTS post_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    impressions INTEGER DEFAULT 0,
    reactions INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    engagement_rate FLOAT DEFAULT 0.0
);

-- Knowledge base with vector embeddings
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_name VARCHAR(256) NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post embeddings for RAG
CREATE TABLE IF NOT EXISTS post_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Style rules learned from edits
CREATE TABLE IF NOT EXISTS style_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_text TEXT NOT NULL,
    source_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edit history for tracking changes requested by employees
CREATE TABLE IF NOT EXISTS edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    original_text TEXT NOT NULL,
    edited_text TEXT NOT NULL,
    diff_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity search function for knowledge base
CREATE OR REPLACE FUNCTION match_knowledge_base(
    query_embedding vector(1536),
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    doc_name VARCHAR,
    chunk_text TEXT,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        doc_name,
        chunk_text,
        1 - (embedding <=> query_embedding) AS similarity
    FROM knowledge_base
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Vector similarity search function for approved posts (few-shot examples)
CREATE OR REPLACE FUNCTION match_posts(
    query_embedding vector(1536),
    match_count INT DEFAULT 3,
    filter_status VARCHAR DEFAULT 'published'
)
RETURNS TABLE (
    id UUID,
    post_id UUID,
    post_text TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        pe.id,
        pe.post_id,
        p.text AS post_text,
        pe.metadata,
        1 - (pe.embedding <=> query_embedding) AS similarity
    FROM post_embeddings pe
    JOIN posts p ON p.id = pe.post_id
    WHERE p.status = filter_status
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_kpis_post_id ON post_kpis(post_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_post_embeddings_embedding ON post_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
