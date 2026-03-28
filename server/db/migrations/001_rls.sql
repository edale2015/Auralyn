-- ============================================================
-- Migration 001: Row-Level Security for clinic-scoped tables
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── clinic_patients ──────────────────────────────────────────
ALTER TABLE clinic_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation_clinic_patients ON clinic_patients;
CREATE POLICY clinic_isolation_clinic_patients
  ON clinic_patients
  USING (clinic_external_id = current_setting('app.clinic_id', true));

-- ── clinic_encounters ─────────────────────────────────────────
ALTER TABLE clinic_encounters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation_clinic_encounters ON clinic_encounters;
CREATE POLICY clinic_isolation_clinic_encounters
  ON clinic_encounters
  USING (clinic_external_id = current_setting('app.clinic_id', true));

-- ── clinic_intake_sessions ────────────────────────────────────
ALTER TABLE clinic_intake_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation_clinic_intake_sessions ON clinic_intake_sessions;
CREATE POLICY clinic_isolation_clinic_intake_sessions
  ON clinic_intake_sessions
  USING (clinic_external_id = current_setting('app.clinic_id', true));

-- Allow superuser / service role to bypass RLS for admin operations
ALTER TABLE clinic_patients     FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_encounters   FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_intake_sessions FORCE ROW LEVEL SECURITY;
