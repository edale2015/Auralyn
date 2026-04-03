import { pool } from "../db/pool";
import { StructuredOverrideReason } from "../db/sharedTypes";
import { appendAuditEvent } from "../governance/audit";

export const OVERRIDE_CATEGORIES = [
  "diagnosis_incorrect",
  "diagnosis_incomplete",
  "disposition_too_aggressive",
  "disposition_insufficient",
  "medication_inappropriate",
  "documentation_error",
  "patient_preference",
  "clinical_context_not_captured",
  "other",
] as const;

export type OverrideCategory = typeof OVERRIDE_CATEGORIES[number];

export interface OverrideParams {
  tenantId: string;
  actorId: string;
  complaintKey: string;
  aiDisposition: string;
  aiDiagnoses: string[];
  reason: StructuredOverrideReason;
}

export interface DeficiencySignal {
  created: true;
  outputFingerprint: string;
  category: string;
  severity: "medium" | "high";
  signalSource: "single_physician_repeat" | "cross_physician_consensus";
}

export async function recordOverrideAndMaybeSignal(
  params: OverrideParams
): Promise<{ deficiencySignal?: DeficiencySignal }> {
  const outputFingerprint = `${params.complaintKey}|${params.aiDisposition}|${params.aiDiagnoses
    .slice()
    .sort()
    .join(",")}`;

  await pool.query(
    `INSERT INTO physician_overrides
     (tenant_id, actor_id, complaint_key, output_fingerprint, ai_disposition, ai_diagnoses_json, reason_category, reason_text)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
    [
      params.tenantId,
      params.actorId,
      params.complaintKey,
      outputFingerprint,
      params.aiDisposition,
      JSON.stringify(params.aiDiagnoses),
      params.reason.category,
      params.reason.freeText ?? null,
    ]
  );

  const [samePhysicianResult, crossPhysicianResult] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS c
       FROM physician_overrides
       WHERE tenant_id = $1
         AND actor_id = $2
         AND output_fingerprint = $3
         AND reason_category = $4`,
      [params.tenantId, params.actorId, outputFingerprint, params.reason.category]
    ),
    pool.query(
      `SELECT count(DISTINCT actor_id)::int AS c
       FROM physician_overrides
       WHERE tenant_id = $1
         AND output_fingerprint = $2
         AND reason_category = $3`,
      [params.tenantId, outputFingerprint, params.reason.category]
    ),
  ]);

  const sameCount: number = samePhysicianResult.rows[0].c;
  const crossCount: number = crossPhysicianResult.rows[0].c;

  if (sameCount >= 3 || crossCount >= 3) {
    const severity: "medium" | "high" = crossCount >= 3 ? "high" : "medium";
    const signalSource =
      crossCount >= 3 ? "cross_physician_consensus" : "single_physician_repeat";

    await pool.query(
      `INSERT INTO kb_deficiency_signals
       (tenant_id, output_fingerprint, reason_category, severity, signal_source, details_json)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        params.tenantId,
        outputFingerprint,
        params.reason.category,
        severity,
        signalSource,
        JSON.stringify({
          complaintKey: params.complaintKey,
          aiDisposition: params.aiDisposition,
          aiDiagnoses: params.aiDiagnoses,
          samePhysicianCount: sameCount,
          crossPhysicianCount: crossCount,
        }),
      ]
    );

    await appendAuditEvent({
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: "KB_DEFICIENCY_SIGNAL_CREATED",
      entityType: "kb_deficiency_signal",
      justification: params.reason.freeText ?? params.reason.category,
      payload: {
        outputFingerprint,
        category: params.reason.category,
        severity,
        signalSource,
        samePhysicianCount: sameCount,
        crossPhysicianCount: crossCount,
      },
    });

    console.log(
      `[OverrideLearning] KB deficiency signal created — ${severity} (${signalSource}) for ${outputFingerprint}`
    );

    return {
      deficiencySignal: {
        created: true,
        outputFingerprint,
        category: params.reason.category,
        severity,
        signalSource,
      },
    };
  }

  return {};
}

export async function getDeficiencySignals(
  tenantId: string,
  limit = 50
): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM kb_deficiency_signals
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows;
}
