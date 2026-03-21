import { query } from "../db/dbRouter";

export interface JobRecord {
  id: string;
  clinic_id?: string | null;
  queue_name: string;
  job_name: string;
  status: string;
  payload?: unknown;
  result?: unknown;
  error?: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function insertJob(input: {
  id: string;
  clinicId?: string;
  queueName: string;
  jobName: string;
  status: string;
  payload?: unknown;
}): Promise<JobRecord> {
  const result = await query(
    `INSERT INTO jobs (id, clinic_id, queue_name, job_name, status, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.id, input.clinicId ?? null, input.queueName, input.jobName, input.status, input.payload ? JSON.stringify(input.payload) : null]
  );
  return result.rows[0];
}

export async function updateJobStatus(id: string, status: string, result?: unknown, error?: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = $1, result = $2, error = $3, updated_at = NOW() WHERE id = $4`,
    [status, result ? JSON.stringify(result) : null, error ?? null, id]
  );
}

export async function listJobs(limit = 100, queueName?: string, clinicId?: string): Promise<JobRecord[]> {
  if (clinicId && queueName) {
    const r = await query(`SELECT * FROM jobs WHERE clinic_id = $1 AND queue_name = $2 ORDER BY created_at DESC LIMIT $3`, [clinicId, queueName, limit]);
    return r.rows;
  }
  if (clinicId) {
    const r = await query(`SELECT * FROM jobs WHERE clinic_id = $1 ORDER BY created_at DESC LIMIT $2`, [clinicId, limit]);
    return r.rows;
  }
  if (queueName) {
    const r = await query(`SELECT * FROM jobs WHERE queue_name = $1 ORDER BY created_at DESC LIMIT $2`, [queueName, limit]);
    return r.rows;
  }
  const r = await query(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}
