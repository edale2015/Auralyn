export interface PrescribingAuditEntry {
  id: string;
  caseId: string;
  medicationId: string;
  action: "requested" | "approved" | "denied" | "modified";
  actorId: string;
  timestamp: string;
  details?: string;
}

const auditLog: PrescribingAuditEntry[] = [];

export function logPrescribingAction(input: Omit<PrescribingAuditEntry, "id" | "timestamp">): PrescribingAuditEntry {
  const entry: PrescribingAuditEntry = {
    ...input,
    id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  auditLog.push(entry);
  return entry;
}

export function getPrescribingAuditLog(caseId?: string): PrescribingAuditEntry[] {
  return (caseId ? auditLog.filter((e) => e.caseId === caseId) : auditLog).reverse();
}
