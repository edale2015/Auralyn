CREATE TABLE IF NOT EXISTS canonical_pathways (
  id               SERIAL PRIMARY KEY,
  pathway_id       TEXT NOT NULL UNIQUE,
  source_type      TEXT NOT NULL,
  complaint_id     TEXT NOT NULL,
  syndrome_id      TEXT NOT NULL,
  label            TEXT NOT NULL,
  required_features JSONB NOT NULL DEFAULT '[]',
  positive_weights  JSONB NOT NULL DEFAULT '{}',
  negative_weights  JSONB NOT NULL DEFAULT '{}',
  exclusions        JSONB NOT NULL DEFAULT '[]',
  treatment_class   TEXT NOT NULL,
  medication_key    TEXT,
  canonical_disposition TEXT NOT NULL,
  rationale         JSONB NOT NULL DEFAULT '[]',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        TEXT NOT NULL,
  updated_by        TEXT NOT NULL,
  retired_at        TIMESTAMP,
  retired_by        TEXT,
  retirement_reason TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_pathways_complaint_id  ON canonical_pathways(complaint_id);
CREATE INDEX IF NOT EXISTS idx_canonical_pathways_syndrome_id   ON canonical_pathways(syndrome_id);
CREATE INDEX IF NOT EXISTS idx_canonical_pathways_active        ON canonical_pathways(active);

CREATE TABLE IF NOT EXISTS physician_overrides (
  id               SERIAL PRIMARY KEY,
  override_id      TEXT NOT NULL UNIQUE,
  patient_id       TEXT NOT NULL,
  complaint        TEXT NOT NULL,
  system_decision  TEXT NOT NULL,
  physician_decision TEXT NOT NULL,
  reason           TEXT NOT NULL,
  discrepancy      BOOLEAN NOT NULL DEFAULT FALSE,
  actor_id         TEXT NOT NULL,
  trace_id         TEXT NOT NULL,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_physician_overrides_patient_id ON physician_overrides(patient_id);
CREATE INDEX IF NOT EXISTS idx_physician_overrides_actor_id   ON physician_overrides(actor_id);
