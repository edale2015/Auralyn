import { db } from "../db";
import { kbComplaints, kbRedFlagRules, kbWorkupRules, kbDiagnosisRules, kbTreatmentRules, kbDispositionRules } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getKbEntity, listKbEntities } from "./kbRepository";
import { logger } from "../utils/logger";

export interface ResolvedComplaintPack {
  complaint: string;
  complaintRow?: Record<string, unknown>;
  entityStoreVersion?: Record<string, unknown>;
  redFlags: unknown[];
  workups: unknown[];
  diagnoses: unknown[];
  treatments: unknown[];
  dispositions: unknown[];
  resolvedFromDb: boolean;
}

export async function resolveComplaintPack(complaint: string): Promise<ResolvedComplaintPack> {
  const normalizedComplaint = complaint.trim().toLowerCase().replace(/\s+/g, "_");

  const entityStoreRow = await getKbEntity("complaint", normalizedComplaint);

  const complaintRows = await db
    .select()
    .from(kbComplaints)
    .where(eq(kbComplaints.complaintId, normalizedComplaint))
    .limit(1);

  const [redFlags, workups, diagnoses, treatments, dispositions] = await Promise.all([
    db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.complaintId, normalizedComplaint)),
    db.select().from(kbWorkupRules).where(eq(kbWorkupRules.complaintId, normalizedComplaint)),
    db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.complaintId, normalizedComplaint)),
    db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.complaintId, normalizedComplaint)),
    db.select().from(kbDispositionRules).where(eq(kbDispositionRules.complaintId, normalizedComplaint)),
  ]);

  return {
    complaint,
    complaintRow: complaintRows[0] as unknown as Record<string, unknown> | undefined,
    entityStoreVersion: entityStoreRow?.currentContent as Record<string, unknown> | undefined,
    redFlags,
    workups,
    diagnoses,
    treatments,
    dispositions,
    resolvedFromDb: Boolean(complaintRows[0]),
  };
}

export async function resolveEntityPackByType(entityType: string): Promise<Record<string, unknown>[]> {
  const entities = await listKbEntities({ entityType: entityType as any, status: "active" });
  return entities.map((e) => ({
    id: e.id,
    key: e.entityKey,
    title: e.title,
    version: e.version,
    content: e.currentContent,
    tags: e.tags,
  }));
}
