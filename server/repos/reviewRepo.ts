import { query } from "../db";

export interface ReviewCase {
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

export async function createReviewCase(input: {
  clinicId: string;
  patientKey?: string;
  status?: string;
  priority?: string;
  summary?: string;
  payload?: unknown;
}): Promise<ReviewCase> {
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

export async function updateReviewCase(
  id: string,
  updates: { status?: string; assignedTo?: string; summary?: string }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    sets.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if (updates.assignedTo !== undefined) {
    sets.push(`assigned_to = $${idx++}`);
    values.push(updates.assignedTo);
  }
  if (updates.summary !== undefined) {
    sets.push(`summary = $${idx++}`);
    values.push(updates.summary);
  }

  if (sets.length === 0) return;

  sets.push(`updated_at = NOW()`);
  values.push(id);

  await query(
    `UPDATE review_cases SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function listReviewCases(
  clinicId?: string,
  status?: string,
  limit = 100
): Promise<ReviewCase[]> {
  if (clinicId && status) {
    const r = await query(
      `SELECT * FROM review_cases WHERE clinic_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3`,
      [clinicId, status, limit]
    );
    return r.rows;
  }
  if (clinicId) {
    const r = await query(
      `SELECT * FROM review_cases WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [clinicId, limit]
    );
    return r.rows;
  }
  const r = await query(
    `SELECT * FROM review_cases ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}
