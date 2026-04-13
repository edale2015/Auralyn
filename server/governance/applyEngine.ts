/**
 * server/governance/applyEngine.ts
 *
 * FIX (Batch-1 Finding #3 — Critical): Implements the actual model change
 * application step that was previously absent from applyApprovedUpdate().
 *
 * applyModelChange() reads the change payload from a governance item and
 * writes it to the appropriate DB table. Without this, every physician
 * approval was theater — the model was never actually updated.
 *
 * Current supported change types:
 *   - diagnosis_weight: update weights table (packId + metric)
 *   - accuracy_target:  update model_versions target accuracy
 *   - generic:          store change in model_versions as a snapshot
 */

import { db }            from "../db";
import { weights, modelVersions } from "../../shared/schema";
import { and, eq }       from "drizzle-orm";
import { auditStep, createTraceId } from "../audit/auditLogger";

export interface ModelChangePayload {
  type?:        "diagnosis_weight" | "accuracy_target" | "generic";
  packId?:      string;
  metricName?:  string;
  newValue?:    number;
  oldValue?:    number;
  newAccuracy?: number;
  oldAccuracy?: number;
  source?:      string;
  [key: string]: unknown;
}

export async function applyModelChange(
  itemId:   string,
  change:   ModelChangePayload,
  appliedBy: string
): Promise<{ applied: boolean; type: string; detail: string }> {
  const type = change.type ?? (change.packId && change.metricName ? "diagnosis_weight" : "generic");

  if (type === "diagnosis_weight" && change.packId && change.metricName !== undefined) {
    // Try to update existing weight row
    const existing = await db
      .select()
      .from(weights)
      .where(
        and(
          eq(weights.packId,  change.packId),
          eq(weights.metric,  change.metricName)
        )
      );

    if (existing.length > 0) {
      await db
        .update(weights)
        .set({ value: change.newValue ?? existing[0].value })
        .where(
          and(
            eq(weights.packId,  change.packId),
            eq(weights.metric,  change.metricName)
          )
        );
    } else {
      await db.insert(weights).values({
        packId:    change.packId,
        metric:    change.metricName,
        value:     change.newValue ?? 1.0,
        complaint: change.packId,
      });
    }

    await auditStep({
      traceId:  createTraceId(),
      step:     "MODEL_WEIGHT_APPLIED",
      input:    { itemId, packId: change.packId, metricName: change.metricName, oldValue: change.oldValue },
      output:   { newValue: change.newValue },
      metadata: { appliedBy, governanceItemId: itemId },
    });

    return {
      applied: true,
      type:    "diagnosis_weight",
      detail:  `Updated weight ${change.packId}:${change.metricName} → ${change.newValue}`,
    };
  }

  if (type === "accuracy_target" || change.newAccuracy !== undefined) {
    // Record as a model version snapshot
    await db.insert(modelVersions).values({
      weights:     change as any,
      cycleCount:  1,
      triggeredBy: `governance:${itemId}:${appliedBy}`,
    });

    await auditStep({
      traceId:  createTraceId(),
      step:     "MODEL_ACCURACY_APPLIED",
      input:    { itemId, oldAccuracy: change.oldAccuracy },
      output:   { newAccuracy: change.newAccuracy },
      metadata: { appliedBy, governanceItemId: itemId },
    });

    return {
      applied: true,
      type:    "accuracy_target",
      detail:  `Model accuracy updated from ${change.oldAccuracy} → ${change.newAccuracy}`,
    };
  }

  // Generic: snapshot the change payload as a model version
  await db.insert(modelVersions).values({
    weights:     change as any,
    cycleCount:  1,
    triggeredBy: `governance:${itemId}:${appliedBy}`,
  });

  await auditStep({
    traceId:  createTraceId(),
    step:     "GENERIC_MODEL_CHANGE_APPLIED",
    input:    { itemId, change },
    output:   { applied: true },
    metadata: { appliedBy, governanceItemId: itemId },
  });

  return {
    applied: true,
    type:    "generic",
    detail:  `Generic change for item ${itemId} snapshotted as model version`,
  };
}
