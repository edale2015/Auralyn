import { eq } from "drizzle-orm";
import { db } from "../../db";
import { canonicalPathways } from "../../../shared/schema";
import { auditStep } from "../../audit/auditLogger";
import { query } from "../../db";

// FIXED: safeReloadKbCache and safeAuditStep previously swallowed all errors silently.
// A cache invalidation failure means the next patient triage uses stale data;
// an audit failure means the change has no trail. Both now log with console.error
// so ops dashboards and log monitors will catch them.

async function safeReloadKbCache(traceId: string): Promise<void> {
  try {
    const { reloadAndRewireKbCache } = await import("../kbRuntime");
    await reloadAndRewireKbCache();
  } catch (err: any) {
    console.error(
      "[KbWriteService] CACHE RELOAD FAILED after KB write (traceId=%s): %s — " +
      "next triage request will use stale KB data until cache TTL expires.",
      traceId,
      err?.message ?? String(err)
    );
  }
}

async function safeAuditStep(
  traceId: string,
  step: string,
  input: unknown,
  output: unknown
): Promise<void> {
  try {
    await auditStep({ traceId, step, input, output, metadata: {} });
  } catch (err: any) {
    console.error(
      "[KbWriteService] AUDIT WRITE FAILED for step=%s (traceId=%s): %s — " +
      "this KB change has no audit record and MUST be investigated.",
      step,
      traceId,
      err?.message ?? String(err)
    );
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
  await db.insert(canonicalPathways).values({
    pathwayId:           data.pathwayId,
    sourceType:          data.sourceType,
    complaintId:         data.complaintId,
    syndromeId:          data.syndromeId,
    label:               data.label,
    requiredFeatures:    data.requiredFeatures,
    positiveWeights:     data.positiveWeights,
    negativeWeights:     data.negativeWeights,
    exclusions:          data.exclusions,
    treatmentClass:      data.treatmentClass,
    medicationKey:       data.medicationKey ?? null,
    canonicalDisposition: data.canonicalDisposition,
    rationale:           data.rationale,
    active:              true,
    createdBy:           actorId,
    updatedBy:           actorId,
  });

  await safeAuditStep(
    traceId,
    "kb_canonical_pathway_created",
    { actorId, ...data },
    { pathwayId: data.pathwayId }
  );

  await safeReloadKbCache(traceId);
  return { ok: true, pathwayId: data.pathwayId };
}

export async function retireCanonicalPathway(
  pathwayId: string,
  actorId: string,
  traceId: string,
  reason: string
): Promise<{ ok: boolean; pathwayId: string }> {
  await db
    .update(canonicalPathways)
    .set({
      active:           false,
      retiredAt:        new Date(),
      retiredBy:        actorId,
      retirementReason: reason,
      updatedBy:        actorId,
    })
    .where(eq(canonicalPathways.pathwayId, pathwayId));

  await safeAuditStep(
    traceId,
    "kb_canonical_pathway_retired",
    { pathwayId, actorId, reason },
    { pathwayId, active: false }
  );

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

export async function upsertPhenotypeRegistry(entry: {
  phenotypeHash: string;
  complaintId: string;
  canonicalSyndromeId?: string;
  canonicalMedicationKey?: string;
  canonicalDisposition: string;
  confidence: string;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO phenotype_registry
         (phenotype_hash, complaint_id, canonical_syndrome_id, canonical_medication_key,
          canonical_disposition, confidence, seen_count, first_seen_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,1,NOW(),NOW())
       ON CONFLICT (phenotype_hash) DO UPDATE
         SET seen_count = phenotype_registry.seen_count + 1,
             last_seen_at = NOW()`,
      [
        entry.phenotypeHash,
        entry.complaintId,
        entry.canonicalSyndromeId ?? null,
        entry.canonicalMedicationKey ?? null,
        entry.canonicalDisposition,
        entry.confidence,
      ]
    );
  } catch (err: any) {
    console.warn("[KbWriteService] upsertPhenotypeRegistry failed:", err?.message);
  }
}
