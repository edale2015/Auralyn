import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { clinicPatients, type InsertClinicPatient } from "../../shared/schema";

export async function createClinicPatient(input: InsertClinicPatient) {
  const [row] = await db.insert(clinicPatients).values(input).returning();
  return row;
}

export async function getClinicPatientById(clinicExternalId: string, patientId: number) {
  return db.query.clinicPatients.findFirst({
    where: and(
      eq(clinicPatients.clinicExternalId, clinicExternalId),
      eq(clinicPatients.id, patientId)
    ),
  });
}

export async function listClinicPatients(clinicExternalId: string, limit = 50) {
  return db.query.clinicPatients.findMany({
    where: eq(clinicPatients.clinicExternalId, clinicExternalId),
    orderBy: desc(clinicPatients.createdAt),
    limit,
  });
}
