import { query } from "../db";

export async function upsertWorkerHeartbeat(input: {
  workerId: string;
  workerType: string;
  status: string;
  hostname?: string;
  pid?: number;
  meta?: unknown;
}) {
  const result = await query(
    `INSERT INTO worker_heartbeats (worker_id, worker_type, status, hostname, pid, last_seen_at, meta)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (worker_id)
     DO UPDATE SET
       worker_type = EXCLUDED.worker_type,
       status = EXCLUDED.status,
       hostname = EXCLUDED.hostname,
       pid = EXCLUDED.pid,
       last_seen_at = NOW(),
       meta = EXCLUDED.meta
     RETURNING *`,
    [
      input.workerId,
      input.workerType,
      input.status,
      input.hostname ?? null,
      input.pid ?? null,
      input.meta ? JSON.stringify(input.meta) : null
    ]
  );

  return result.rows[0];
}

export async function listWorkerHeartbeats() {
  const result = await query(
    `SELECT * FROM worker_heartbeats ORDER BY last_seen_at DESC`
  );

  return result.rows;
}
