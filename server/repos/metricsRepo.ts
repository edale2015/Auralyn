import { query } from "../db";

export interface MetricSnapshot {
  id: string;
  clinic_id?: string | null;
  metric_group: string;
  metric_name: string;
  metric_value: number;
  labels?: unknown;
  captured_at: Date;
}

export async function recordMetric(input: {
  clinicId?: string;
  metricGroup: string;
  metricName: string;
  metricValue: number;
  labels?: Record<string, unknown>;
}): Promise<MetricSnapshot> {
  const result = await query(
    `INSERT INTO metrics_snapshots (clinic_id, metric_group, metric_name, metric_value, labels)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.clinicId ?? null,
      input.metricGroup,
      input.metricName,
      input.metricValue,
      input.labels ? JSON.stringify(input.labels) : null
    ]
  );
  return result.rows[0];
}

export async function listMetrics(
  metricGroup: string,
  metricName?: string,
  limit = 200,
  clinicId?: string
): Promise<MetricSnapshot[]> {
  if (clinicId && metricName) {
    const r = await query(
      `SELECT * FROM metrics_snapshots WHERE clinic_id = $1 AND metric_group = $2 AND metric_name = $3 ORDER BY captured_at DESC LIMIT $4`,
      [clinicId, metricGroup, metricName, limit]
    );
    return r.rows;
  }
  if (metricName) {
    const r = await query(
      `SELECT * FROM metrics_snapshots WHERE metric_group = $1 AND metric_name = $2 ORDER BY captured_at DESC LIMIT $3`,
      [metricGroup, metricName, limit]
    );
    return r.rows;
  }
  const r = await query(
    `SELECT * FROM metrics_snapshots WHERE metric_group = $1 ORDER BY captured_at DESC LIMIT $2`,
    [metricGroup, limit]
  );
  return r.rows;
}

export async function insertMetricSnapshot(input: {
  clinicId?: string;
  metricGroup: string;
  metricName: string;
  metricValue: number;
  labels?: Record<string, unknown>;
}): Promise<MetricSnapshot> {
  return recordMetric(input);
}

export async function listRecentMetricSnapshots(clinicId?: string, limit = 200): Promise<MetricSnapshot[]> {
  const r = clinicId
    ? await query(
        `SELECT * FROM metrics_snapshots WHERE clinic_id = $1 ORDER BY captured_at DESC LIMIT $2`,
        [clinicId, limit]
      )
    : await query(
        `SELECT * FROM metrics_snapshots ORDER BY captured_at DESC LIMIT $1`,
        [limit]
      );
  return r.rows;
}
