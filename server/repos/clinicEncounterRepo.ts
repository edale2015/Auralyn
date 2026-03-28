import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { clinicEncounters, type InsertClinicEncounter } from "../../shared/schema";

export async function createClinicEncounter(input: InsertClinicEncounter) {
  const [row] = await db.insert(clinicEncounters).values(input).returning();
  return row;
}

export async function updateClinicEncounter(
  clinicExternalId: string,
  encounterId: number,
  patch: Partial<InsertClinicEncounter>
) {
  const [row] = await db
    .update(clinicEncounters)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(clinicEncounters.clinicExternalId, clinicExternalId),
        eq(clinicEncounters.id, encounterId)
      )
    )
    .returning();
  return row;
}

export async function listClinicEncounters(clinicExternalId: string, limit = 20) {
  return db.query.clinicEncounters.findMany({
    where: eq(clinicEncounters.clinicExternalId, clinicExternalId),
    orderBy: desc(clinicEncounters.createdAt),
    limit,
  });
}
