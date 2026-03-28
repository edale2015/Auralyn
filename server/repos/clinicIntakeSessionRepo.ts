import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { clinicIntakeSessions, type InsertClinicIntakeSession } from "../../shared/schema";

export async function createClinicIntakeSession(input: InsertClinicIntakeSession) {
  const [row] = await db.insert(clinicIntakeSessions).values(input).returning();
  return row;
}

export async function updateClinicIntakeSession(
  clinicExternalId: string,
  sessionId: number,
  patch: Partial<InsertClinicIntakeSession>
) {
  const [row] = await db
    .update(clinicIntakeSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(clinicIntakeSessions.clinicExternalId, clinicExternalId),
        eq(clinicIntakeSessions.id, sessionId)
      )
    )
    .returning();
  return row;
}

export async function getClinicIntakeSession(clinicExternalId: string, sessionId: number) {
  return db.query.clinicIntakeSessions.findFirst({
    where: and(
      eq(clinicIntakeSessions.clinicExternalId, clinicExternalId),
      eq(clinicIntakeSessions.id, sessionId)
    ),
  });
}

export async function listClinicIntakeSessions(clinicExternalId: string, limit = 20) {
  return db.query.clinicIntakeSessions.findMany({
    where: eq(clinicIntakeSessions.clinicExternalId, clinicExternalId),
    orderBy: desc(clinicIntakeSessions.createdAt),
    limit,
  });
}
