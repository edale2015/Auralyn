import { query } from "../db";

export async function upsertClinicFeatureState(input: {
  clinicId: string;
  featureName: string;
  enabled: boolean;
  config?: unknown;
}) {
  const result = await query(
    `INSERT INTO clinic_feature_states (clinic_id, feature_name, enabled, config, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (clinic_id, feature_name)
     DO UPDATE SET
       enabled = EXCLUDED.enabled,
       config = EXCLUDED.config,
       updated_at = NOW()
     RETURNING *`,
    [input.clinicId, input.featureName, input.enabled, input.config ?? null]
  );

  return result.rows[0];
}

export async function listClinicFeatureStates(clinicId?: string) {
  const result = clinicId
    ? await query(
        `SELECT * FROM clinic_feature_states WHERE clinic_id = $1 ORDER BY feature_name`,
        [clinicId]
      )
    : await query(
        `SELECT * FROM clinic_feature_states ORDER BY clinic_id, feature_name`
      );

  return result.rows;
}

export async function insertClinicHealthSnapshot(input: {
  clinicId: string;
  status: string;
  summary: unknown;
}) {
  const result = await query(
    `INSERT INTO clinic_health_snapshots (clinic_id, status, summary)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.clinicId, input.status, input.summary ? JSON.stringify(input.summary) : null]
  );

  return result.rows[0];
}

export async function listLatestClinicHealth() {
  const result = await query(
    `
    SELECT DISTINCT ON (clinic_id)
      clinic_id, status, summary, created_at
    FROM clinic_health_snapshots
    ORDER BY clinic_id, created_at DESC
    `
  );

  return result.rows;
}
