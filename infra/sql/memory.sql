-- Hybrid Memory Graph Schema
-- Requires pgvector extension for vector similarity search.
-- Apply in production: CREATE EXTENSION IF NOT EXISTS vector;
-- For development, the in-memory hybridMemory.ts fallback is used.

-- Enable pgvector (run once as superuser)
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  label       TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  tags        TEXT[],
  embedding   JSONB,          -- VECTOR(1536) when pgvector is available
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_edges (
  id          SERIAL PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL,
  weight      FLOAT DEFAULT 1.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_tags ON memory_nodes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memory_nodes_data ON memory_nodes USING GIN(data);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_id);

-- pgvector index (uncomment when pgvector is installed):
-- CREATE INDEX IF NOT EXISTS idx_memory_nodes_embedding
--   ON memory_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS clinical_scores (
  id          SERIAL PRIMARY KEY,
  patient_id  TEXT,
  score_type  TEXT NOT NULL,   -- 'centor' | 'curb65' | 'combined'
  score       INT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_scores_patient ON clinical_scores(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_scores_type ON clinical_scores(score_type);
