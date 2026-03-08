export interface PatientIdentity {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone?: string;
  email?: string;
  verified: boolean;
  verifiedAt?: string;
}

const patients = new Map<string, PatientIdentity>();

export function registerPatientIdentity(input: Omit<PatientIdentity, "verified" | "verifiedAt">): PatientIdentity {
  const identity: PatientIdentity = { ...input, verified: false };
  patients.set(input.patientId, identity);
  return identity;
}

export function verifyPatientIdentity(patientId: string): PatientIdentity | null {
  const p = patients.get(patientId);
  if (!p) return null;
  p.verified = true;
  p.verifiedAt = new Date().toISOString();
  return p;
}

export function getPatientIdentity(patientId: string): PatientIdentity | undefined {
  return patients.get(patientId);
}

export function listPatientIdentities(): PatientIdentity[] {
  return Array.from(patients.values());
}
