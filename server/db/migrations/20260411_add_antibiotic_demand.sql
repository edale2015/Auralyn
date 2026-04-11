-- Communication Outcomes
CREATE TABLE IF NOT EXISTS communication_outcomes (
  id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  complaint TEXT,
  visit_count INTEGER,
  script_variant TEXT,
  tone TEXT,
  antibiotics_requested BOOLEAN DEFAULT FALSE,
  antibiotics_given BOOLEAN DEFAULT FALSE,
  delayed_rx_offered BOOLEAN DEFAULT FALSE,
  delayed_rx_accepted BOOLEAN DEFAULT FALSE,
  return_visit_within_7_days BOOLEAN,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Antibiotic Demand Events
CREATE TABLE IF NOT EXISTS antibiotic_demand_events (
  id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  complaint TEXT,
  demanded BOOLEAN DEFAULT FALSE,
  delayed_rx_offered BOOLEAN DEFAULT FALSE,
  delayed_rx_used BOOLEAN DEFAULT FALSE,
  antibiotics_given BOOLEAN DEFAULT FALSE,
  return_visit_7d BOOLEAN,
  centor_score INTEGER,
  phrases_matched TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Delayed Prescriptions
CREATE TABLE IF NOT EXISTS delayed_prescriptions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  medication TEXT NOT NULL,
  instructions TEXT,
  activation_criteria TEXT[],
  status TEXT DEFAULT 'PENDING_ACTIVATION',
  expires_at TIMESTAMP,
  activated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comm_outcomes_patient_id ON communication_outcomes(patient_id);
CREATE INDEX IF NOT EXISTS idx_antibiotic_events_patient_id ON antibiotic_demand_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_delayed_rx_patient_id ON delayed_prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_delayed_rx_status ON delayed_prescriptions(status);
