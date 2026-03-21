CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  idempotency_key TEXT UNIQUE,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT,
  queue_name TEXT NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  trace_id TEXT,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT NOT NULL,
  patient_key TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to TEXT,
  summary TEXT,
  payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  case_id TEXT,
  patient_key TEXT,
  predicted JSONB,
  actual JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  metric_group TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels JSONB,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT,
  payload JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_clinic_created ON requests (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_clinic_created ON jobs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_trace ON audit_logs (trace_id);
CREATE INDEX IF NOT EXISTS idx_review_cases_clinic_status ON review_cases (clinic_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_clinic_status ON outcomes (clinic_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_group_name_time ON metrics_snapshots (metric_group, metric_name, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events (severity, created_at DESC);
