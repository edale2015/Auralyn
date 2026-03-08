export interface ConsentRecord {
  consentId: string;
  patientId: string;
  type: "treatment" | "data_sharing" | "telehealth" | "research";
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
  version: string;
}

const consents: ConsentRecord[] = [];

export function recordConsent(input: Omit<ConsentRecord, "consentId" | "grantedAt">): ConsentRecord {
  const record: ConsentRecord = {
    ...input,
    consentId: `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    grantedAt: input.granted ? new Date().toISOString() : undefined,
  };
  consents.push(record);
  return record;
}

export function revokeConsent(consentId: string): ConsentRecord | null {
  const c = consents.find((x) => x.consentId === consentId);
  if (!c) return null;
  c.granted = false;
  c.revokedAt = new Date().toISOString();
  return c;
}

export function getPatientConsents(patientId: string): ConsentRecord[] {
  return consents.filter((c) => c.patientId === patientId);
}

export function listAllConsents(): ConsentRecord[] {
  return [...consents].reverse();
}
