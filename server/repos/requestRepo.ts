import { query } from "../db";

export interface RequestRecord {
  id: string;
  clinic_id?: string | null;
  idempotency_key?: string | null;
  route: string;
  method: string;
  status: string;
  response?: unknown;
  created_at: Date;
  updated_at: Date;
}

export async function insertRequest(input: {
  clinicId?: string;
  idempotencyKey?: string;
  route: string;
  method: string;
  status: string;
  response?: unknown;
}): Promise<RequestRecord> {
  const result = await query(
    `INSERT INTO requests (clinic_id, idempotency_key, route, method, status, response)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [input.clinicId ?? null, input.idempotencyKey ?? null, input.route, input.method, input.status, input.response ? JSON.stringify(input.response) : null]
  );
  return result.rows[0];
}

export async function updateRequestStatus(id: string, status: string, response?: unknown): Promise<void> {
  await query(
    `UPDATE requests SET status = $1, response = $2, updated_at = NOW() WHERE id = $3`,
    [status, response ? JSON.stringify(response) : null, id]
  );
}

export async function listRequests(limit = 100, clinicId?: string): Promise<RequestRecord[]> {
  const result = clinicId
    ? await query(`SELECT * FROM requests WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT $2`, [clinicId, limit])
    : await query(`SELECT * FROM requests ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows;
}
