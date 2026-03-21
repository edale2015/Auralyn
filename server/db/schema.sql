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

CREATE TABLE IF NOT EXISTS triage_audit_logs (
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

CREATE TABLE IF NOT EXISTS triage_outcomes (
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

CREATE TABLE IF NOT EXISTS engine_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  engine_name TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  total_latency_ms BIGINT NOT NULL DEFAULT 0,
  last_latency_ms BIGINT,
  last_error TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, engine_name)
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  worker_type TEXT NOT NULL,
  status TEXT NOT NULL,
  hostname TEXT,
  pid INTEGER,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  meta JSONB
);

CREATE TABLE IF NOT EXISTS clinic_feature_states (
  clinic_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, feature_name)
);

CREATE TABLE IF NOT EXISTS clinic_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_clinic_created ON requests (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_clinic_created ON jobs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_audit_logs_trace ON triage_audit_logs (trace_id);
CREATE INDEX IF NOT EXISTS idx_triage_audit_logs_clinic ON triage_audit_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_cases_clinic_status ON review_cases (clinic_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_outcomes_clinic_status ON triage_outcomes (clinic_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshots_group_name_time ON metrics_snapshots (metric_group, metric_name, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_metrics_updated ON engine_metrics (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_seen ON worker_heartbeats (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_health_snapshots_clinic ON clinic_health_snapshots (clinic_id, created_at DESC);
