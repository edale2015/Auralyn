/**
 * server/kb/kbResolver.ts — KB complaint pack resolution
 *
 * FIX (Code Review Issue #18):
 *   All rule table queries were missing active/status filters. Inactive, draft, and
 *   deprecated rules were included in every resolution result, meaning deprecated
 *   clinical logic could affect live patient care. Fixed: every rule table query
 *   now includes `WHERE active = true` (or equivalent status filter where the
 *   column is named differently). resolveEntityPackByType already filtered by
 *   status: "active" — that path was correct and is preserved.
 */

import { db } from "../db";
import {
  kbComplaints,
  kbRedFlagRules,
  kbWorkupRules,
  kbDiagnosisRules,
  kbTreatmentRules,
  kbDispositionRules,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { getKbEntity, listKbEntities } from "./kbRepository";
import { logger } from "../utils/logger";
import { COMPLAINT_PACK_REGISTRY } from "./complaintPacks/index";
import type { ExtractedClinicalState } from "./complaintPacks/index";

export interface ResolvedComplaintPack {
  complaint:           string;
  complaintRow?:       Record<string, unknown>;
  entityStoreVersion?: Record<string, unknown>;
  redFlags:            unknown[];
  workups:             unknown[];
  diagnoses:           unknown[];
  treatments:          unknown[];
  dispositions:        unknown[];
  resolvedFromDb:      boolean;
}

export async function resolveComplaintPack(complaint: string): Promise<ResolvedComplaintPack> {
  const normalizedComplaint = complaint.trim().toLowerCase().replace(/\s+/g, "_");

  const entityStoreRow = await getKbEntity("complaint", normalizedComplaint);

  const complaintRows = await db
    .select()
    .from(kbComplaints)
    .where(eq(kbComplaints.complaintId, normalizedComplaint))
    .limit(1);

  // Issue #18 FIX: all rule queries now include active = true filter.
  // Previously none of these had an active filter — inactive/draft rows were included.
  const [redFlags, workups, diagnoses, treatments, dispositions] = await Promise.all([
    db.select().from(kbRedFlagRules)
      .where(
        and(
          eq(kbRedFlagRules.complaintId, normalizedComplaint),
          eq(kbRedFlagRules.active, true),
        )
      ),

    db.select().from(kbWorkupRules)
      .where(
        and(
          eq(kbWorkupRules.complaintId, normalizedComplaint),
          eq(kbWorkupRules.active, true),
        )
      ),

    db.select().from(kbDiagnosisRules)
      .where(
        and(
          eq(kbDiagnosisRules.complaintId, normalizedComplaint),
          eq(kbDiagnosisRules.active, true),
        )
      ),

    db.select().from(kbTreatmentRules)
      .where(
        and(
          eq(kbTreatmentRules.complaintId, normalizedComplaint),
          eq(kbTreatmentRules.active, true),
        )
      ),

    db.select().from(kbDispositionRules)
      .where(
        and(
          eq(kbDispositionRules.complaintId, normalizedComplaint),
          eq(kbDispositionRules.active, true),
        )
      ),
  ]);

  return {
    complaint,
    complaintRow:       complaintRows[0] as unknown as Record<string, unknown> | undefined,
    entityStoreVersion: entityStoreRow?.currentContent as Record<string, unknown> | undefined,
    redFlags,
    workups,
    diagnoses,
    treatments,
    dispositions,
    resolvedFromDb: Boolean(complaintRows[0]),
  };
}

// ── In-memory complaint pack router ──────────────────────────────────────────
// Routes to typed in-memory packs first; falls back to DB resolveComplaintPack.

export function resolveComplaintPackDirect(
  complaintId: string,
  clinicalState: ExtractedClinicalState
): ReturnType<typeof COMPLAINT_PACK_REGISTRY[keyof typeof COMPLAINT_PACK_REGISTRY]["computeTriage"]> | null {
  const normalizedId = complaintId.trim().toLowerCase().replace(/\s+/g, "_");
  const pack = COMPLAINT_PACK_REGISTRY[normalizedId as keyof typeof COMPLAINT_PACK_REGISTRY];
  if (!pack) return null;
  try {
    return pack.computeTriage(clinicalState);
  } catch (e) {
    logger.warn(`[KBResolver] resolveComplaintPackDirect failed for ${normalizedId}`, { error: String(e) });
    return null;
  }
}

export async function resolveEntityPackByType(entityType: string): Promise<Record<string, unknown>[]> {
  // Already filtered by status: "active" — preserved as-is
  const entities = await listKbEntities({ entityType: entityType as any, status: "active" });
  return entities.map((e) => ({
    id:      e.id,
    key:     e.entityKey,
    title:   e.title,
    version: e.version,
    content: e.currentContent,
    tags:    e.tags,
  }));
}
