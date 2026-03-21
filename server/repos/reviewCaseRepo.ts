import { query } from "../db";

export interface ReviewCaseRecord {
  id: string;
  clinic_id: string;
  patient_key?: string | null;
  status: string;
  priority: string;
  assigned_to?: string | null;
  summary?: string | null;
  payload?: unknown;
  created_at: Date;
  updated_at: Date;
}

export async function insertReviewCase(input: {
  clinicId: string;
  patientKey?: string;
  status?: string;
  priority?: string;
  summary?: string;
  payload?: unknown;
}): Promise<ReviewCaseRecord> {
  const result = await query(
    `INSERT INTO review_cases (clinic_id, patient_key, status, priority, summary, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.clinicId,
      input.patientKey ?? null,
      input.status ?? "pending",
      input.priority ?? "normal",
      input.summary ?? null,
      input.payload ? JSON.stringify(input.payload) : null
    ]
  );
  return result.rows[0];
}

export async function updateReviewCaseStatus(id: string, status: string, assignedTo?: string): Promise<void> {
  await query(
    `UPDATE review_cases SET status = $1, assigned_to = $2, updated_at = NOW() WHERE id = $3`,
    [status, assignedTo ?? null, id]
  );
}

export async function listReviewCases(clinicId: string, status?: string, limit = 100): Promise<ReviewCaseRecord[]> {
  const result = status
    ? await query(`SELECT * FROM review_cases WHERE clinic_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT $3`, [clinicId, status, limit])
    : await query(`SELECT * FROM review_cases WHERE clinic_id = $1 ORDER BY updated_at DESC LIMIT $2`, [clinicId, limit]);
  return result.rows;
}
