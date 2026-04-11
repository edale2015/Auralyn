import { query } from "../../db";
import { auditStep } from "../../audit/auditLogger";
import { v4 as uuidv4 } from "uuid";

async function safeReloadKbCache(traceId: string): Promise<void> {
  try {
    const { reloadAndRewireKbCache } = await import("../kbRuntime");
    await reloadAndRewireKbCache(traceId);
  } catch {
    // KB cache reload failed — non-fatal; pathway is already written
  }
}

export interface CanonicalPathwayData {
  pathwayId: string;
  sourceType: string;
  complaintId: string;
  syndromeId: string;
  label: string;
  requiredFeatures: string[];
  positiveWeights: Record<string, number>;
  negativeWeights: Record<string, number>;
  exclusions: string[];
  treatmentClass: string;
  medicationKey?: string;
  canonicalDisposition: string;
  rationale: string[];
  active?: boolean;
}

export async function createCanonicalPathway(
  data: CanonicalPathwayData,
  actorId: string,
  traceId: string
): Promise<{ ok: boolean; pathwayId: string }> {
  await query(
    `INSERT INTO canonical_pathways
       (pathway_id, source_type, complaint_id, syndrome_id, label,
        required_features, positive_weights, negative_weights, exclusions,
        treatment_class, medication_key, canonical_disposition, rationale,
        active, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
    [
      data.pathwayId,
      data.sourceType,
      data.complaintId,
      data.syndromeId,
      data.label,
      JSON.stringify(data.requiredFeatures),
      JSON.stringify(data.positiveWeights),
      JSON.stringify(data.negativeWeights),
      JSON.stringify(data.exclusions),
      data.treatmentClass,
      data.medicationKey ?? null,
      data.canonicalDisposition,
      JSON.stringify(data.rationale),
      true,
      actorId,
    ]
  );

  try {
    await auditStep({
      traceId,
      step: "kb_canonical_pathway_created",
      input: { actorId, ...data },
      output: { pathwayId: data.pathwayId },
      metadata: { actorId },
    });
  } catch {
    // Audit failure is non-fatal in dev
  }

  await safeReloadKbCache(traceId);
  return { ok: true, pathwayId: data.pathwayId };
}

export async function retireCanonicalPathway(
  pathwayId: string,
  actorId: string,
  traceId: string,
  reason: string
): Promise<{ ok: boolean; pathwayId: string }> {
  await query(
    `UPDATE canonical_pathways
     SET active = FALSE, retired_at = NOW(), retired_by = $2,
         retirement_reason = $3, updated_by = $2
     WHERE pathway_id = $1`,
    [pathwayId, actorId, reason]
  );

  try {
    await auditStep({
      traceId,
      step: "kb_canonical_pathway_retired",
      input: { pathwayId, actorId, reason },
      output: { pathwayId, active: false },
      metadata: { actorId },
    });
  } catch {
    // Audit failure non-fatal
  }

  await safeReloadKbCache(traceId);
  return { ok: true, pathwayId };
}

export async function listCanonicalPathways(
  complaintId?: string,
  activeOnly = true
): Promise<any[]> {
  try {
    const result = complaintId
      ? await query(
          `SELECT * FROM canonical_pathways WHERE complaint_id = $1 ${activeOnly ? "AND active = TRUE" : ""} ORDER BY created_at DESC`,
          [complaintId]
        )
      : await query(
          `SELECT * FROM canonical_pathways ${activeOnly ? "WHERE active = TRUE" : ""} ORDER BY created_at DESC`
        );
    return result.rows;
  } catch {
    return [];
  }
}

export async function getCanonicalPathway(pathwayId: string): Promise<any | null> {
  try {
    const result = await query(
      `SELECT * FROM canonical_pathways WHERE pathway_id = $1 LIMIT 1`,
      [pathwayId]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}
