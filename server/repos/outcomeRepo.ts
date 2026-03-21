import { query } from "../db";

export interface OutcomeRecord {
  id: string;
  clinic_id?: string | null;
  case_id?: string | null;
  patient_key?: string | null;
  predicted?: unknown;
  actual?: unknown;
  status: string;
  notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function insertOutcome(input: {
  clinicId?: string;
  caseId?: string;
  patientKey?: string;
  predicted?: unknown;
  status?: string;
}): Promise<OutcomeRecord> {
  const result = await query(
    `INSERT INTO triage_outcomes (clinic_id, case_id, patient_key, predicted, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.clinicId ?? null,
      input.caseId ?? null,
      input.patientKey ?? null,
      input.predicted ? JSON.stringify(input.predicted) : null,
      input.status ?? "pending"
    ]
  );
  return result.rows[0];
}

export async function updateOutcomeActual(id: string, actual: unknown, notes?: string): Promise<void> {
  await query(
    `UPDATE triage_outcomes SET actual = $1, notes = $2, status = 'recorded', updated_at = NOW() WHERE id = $3`,
    [JSON.stringify(actual), notes ?? null, id]
  );
}

export async function listOutcomes(limit = 100, clinicId?: string): Promise<OutcomeRecord[]> {
  const result = clinicId
    ? await query(`SELECT * FROM triage_outcomes WHERE clinic_id = $1 ORDER BY updated_at DESC LIMIT $2`, [clinicId, limit])
    : await query(`SELECT * FROM triage_outcomes ORDER BY updated_at DESC LIMIT $1`, [limit]);
  return result.rows;
}
