import { query } from "../db";

export async function recordEngineSuccess(input: {
  clinicId?: string;
  engineName: string;
  latencyMs: number;
}) {
  await query(
    `INSERT INTO engine_metrics (clinic_id, engine_name, success_count, error_count, total_latency_ms, last_latency_ms, updated_at)
     VALUES ($1, $2, 1, 0, $3, $3, NOW())
     ON CONFLICT (clinic_id, engine_name)
     DO UPDATE SET
       success_count = engine_metrics.success_count + 1,
       total_latency_ms = engine_metrics.total_latency_ms + EXCLUDED.total_latency_ms,
       last_latency_ms = EXCLUDED.last_latency_ms,
       updated_at = NOW()`,
    [input.clinicId ?? null, input.engineName, input.latencyMs]
  );
}

export async function recordEngineError(input: {
  clinicId?: string;
  engineName: string;
  latencyMs: number;
  error: string;
}) {
  await query(
    `INSERT INTO engine_metrics (clinic_id, engine_name, success_count, error_count, total_latency_ms, last_latency_ms, last_error, updated_at)
     VALUES ($1, $2, 0, 1, $3, $3, $4, NOW())
     ON CONFLICT (clinic_id, engine_name)
     DO UPDATE SET
       error_count = engine_metrics.error_count + 1,
       total_latency_ms = engine_metrics.total_latency_ms + EXCLUDED.total_latency_ms,
       last_latency_ms = EXCLUDED.last_latency_ms,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()`,
    [input.clinicId ?? null, input.engineName, input.latencyMs, input.error]
  );
}

export async function listEngineMetrics(clinicId?: string) {
  const result = clinicId
    ? await query(`SELECT * FROM engine_metrics WHERE clinic_id = $1 ORDER BY engine_name`, [clinicId])
    : await query(`SELECT * FROM engine_metrics ORDER BY clinic_id NULLS FIRST, engine_name`);

  return result.rows;
}
