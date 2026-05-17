-- Migration: clinical_memory table for ClinicalMemoryStore
-- Implements cross-encounter durable memory with scope-based RLS

CREATE TABLE IF NOT EXISTS clinical_memory (
  id              TEXT PRIMARY KEY,
  scope           TEXT NOT NULL CHECK (scope IN ('global','tenant','physician')),
  tenant_id       TEXT,
  physician_id    TEXT,
  key             TEXT NOT NULL,
  content         TEXT NOT NULL,
  confidence      REAL NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active','shadow','revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by     TEXT,
  verified_at     TIMESTAMPTZ,
  source          TEXT,
  retrieved_count INT NOT NULL DEFAULT 0,
  last_retrieved  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cm_scope_key
  ON clinical_memory (scope, tenant_id, physician_id, key);

CREATE INDEX IF NOT EXISTS idx_cm_status
  ON clinical_memory (status);

ALTER TABLE clinical_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_physician_scope ON clinical_memory;
CREATE POLICY cm_physician_scope
  ON clinical_memory
  USING (
    scope = 'global'
    OR (scope = 'tenant'    AND tenant_id    = current_setting('app.tenant_id',    true))
    OR (scope = 'physician' AND tenant_id    = current_setting('app.tenant_id',    true)
                            AND physician_id = current_setting('app.physician_id', true))
  );
