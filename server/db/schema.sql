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

-- Generalized Automation Layer
CREATE TABLE IF NOT EXISTS automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  target_type TEXT NOT NULL DEFAULT 'web',
  start_url TEXT NOT NULL,
  login_url TEXT,
  definition JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_template_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  definition JSONB NOT NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_template_history_key ON automation_template_history (template_key, archived_at DESC);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id TEXT,
  template_key TEXT NOT NULL,
  status TEXT NOT NULL,
  trace_id TEXT,
  started_by TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  result JSONB,
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  step_index INTEGER,
  action_name TEXT,
  payload JSONB,
  screenshot_key TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  checkpoint_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  decided_by TEXT,
  decision_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_template ON automation_runs (template_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_run_events_run ON automation_run_events (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_automation_approvals_run ON automation_approvals (run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_key TEXT NOT NULL UNIQUE,
  system_name TEXT NOT NULL,
  username TEXT,
  secret_json JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_credentials_key ON automation_credentials (credential_key);

-- Clinical Case Persistence (Postgres source of truth + Redis cache)
CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  complaint TEXT NOT NULL,
  diagnosis TEXT,
  risk_score FLOAT,
  physician TEXT,
  price FLOAT,
  billing_code TEXT,
  disposition TEXT,
  malpractice_risk FLOAT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physicians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  performance FLOAT DEFAULT 1.0,
  active_cases INT DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(case_id) ON DELETE SET NULL,
  payer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount FLOAT,
  billing_code TEXT,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_created ON cases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_risk ON cases (risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_claims_payer_status ON claims (payer, status);
CREATE INDEX IF NOT EXISTS idx_claims_case ON claims (case_id);

-- ── Phase 3: KB Normalized Tables ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_red_flag_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE,
  complaint_id TEXT NOT NULL,
  label TEXT NOT NULL,
  trigger_expr TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'HARD',
  action TEXT NOT NULL DEFAULT 'ER_SEND',
  immediate_actions TEXT,
  rationale TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_clinical_weights (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value REAL NOT NULL,
  description TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_complaint_modules (
  id SERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL,
  module_type TEXT NOT NULL,
  module_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_complaint_packs (
  id SERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  findings JSONB NOT NULL DEFAULT '[]',
  modifiers JSONB NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kb_feature_likelihoods (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  feature_value TEXT DEFAULT 'yes',
  likelihood REAL NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL DEFAULT 'ui_edit',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (rule_id, feature_key, feature_value)
);

-- ── Phase 3+: Advanced probabilistic feature model ───────────────────────────

CREATE TABLE IF NOT EXISTS kb_feature_models (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  feature_type TEXT NOT NULL DEFAULT 'boolean',
  p_present REAL,
  p_absent REAL,
  categorical_map JSONB,
  mean REAL,
  std_dev REAL,
  min_value REAL,
  max_value REAL,
  weight REAL NOT NULL DEFAULT 1.0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'manual',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (rule_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_kb_feature_models_rule ON kb_feature_models (rule_id);

-- ── Phase 3+: Engine routing (replaces SCORING_MODULE_DISPATCH) ──────────────

CREATE TABLE IF NOT EXISTS kb_engine_routing (
  id SERIAL PRIMARY KEY,
  complaint_id TEXT NOT NULL,
  engine_type TEXT NOT NULL DEFAULT 'bayesian',
  config JSONB NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_engine_routing_complaint ON kb_engine_routing (complaint_id);

-- ── Weights history for RLHF persistence ────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_weight_events (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  delta REAL NOT NULL,
  new_value REAL NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_weight_events_key ON kb_weight_events (key, created_at DESC);

-- ── Advanced Reasoning: Co-morbidity Engine ──────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_diagnosis_interactions (
  id SERIAL PRIMARY KEY,
  dx_a TEXT NOT NULL,
  dx_b TEXT NOT NULL,
  interaction_type TEXT NOT NULL DEFAULT 'synergy',
  strength FLOAT NOT NULL DEFAULT 0.0,
  conditions JSONB,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_dx_interactions_pair
  ON kb_diagnosis_interactions (dx_a, dx_b, interaction_type);

CREATE TABLE IF NOT EXISTS kb_diagnosis_clusters (
  id SERIAL PRIMARY KEY,
  cluster_id TEXT NOT NULL UNIQUE,
  diagnoses TEXT[] NOT NULL DEFAULT '{}',
  boost FLOAT NOT NULL DEFAULT 0.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Advanced Reasoning: Temporal Engine ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_temporal_patterns (
  id SERIAL PRIMARY KEY,
  diagnosis TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  duration_hours INT,
  likelihood FLOAT NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_temporal_patterns_uniq
  ON kb_temporal_patterns (diagnosis, feature_key, pattern_type);

CREATE TABLE IF NOT EXISTS patient_time_series (
  id SERIAL PRIMARY KEY,
  case_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  t TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  value FLOAT NOT NULL,
  unit TEXT
);

CREATE INDEX IF NOT EXISTS idx_patient_ts_case ON patient_time_series (case_id, feature_key, t);

-- ── Advanced Reasoning: Outcome Learning System ───────────────────────────────

CREATE TABLE IF NOT EXISTS kb_outcomes (
  id SERIAL PRIMARY KEY,
  case_id TEXT NOT NULL,
  predicted_dx TEXT,
  actual_dx TEXT,
  predicted_disposition TEXT,
  actual_disposition TEXT,
  correct BOOLEAN,
  clinician_override BOOLEAN NOT NULL DEFAULT false,
  outcome_severity TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_outcomes_case ON kb_outcomes (case_id);
CREATE INDEX IF NOT EXISTS idx_kb_outcomes_dx ON kb_outcomes (predicted_dx, correct);

CREATE TABLE IF NOT EXISTS kb_learning_events (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL,
  feature_key TEXT NOT NULL DEFAULT '__base__',
  delta FLOAT NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'simulation',
  status TEXT NOT NULL DEFAULT 'pending',
  rationale TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  deployed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_learning_events_status ON kb_learning_events (status, created_at DESC);
