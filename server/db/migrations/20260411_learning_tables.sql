CREATE TABLE IF NOT EXISTS patient_history (
  id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  complaint TEXT,
  antibiotics_given BOOLEAN DEFAULT FALSE,
  improved_with_antibiotics BOOLEAN,
  return_visit BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_history_patient_id ON patient_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_history_timestamp  ON patient_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS clinic_population_stats (
  id SERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL UNIQUE,
  antibiotic_success_rate FLOAT NOT NULL DEFAULT 0.5,
  return_visit_rate FLOAT NOT NULL DEFAULT 0.1,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_population_stats_clinic_id ON clinic_population_stats(clinic_id);
