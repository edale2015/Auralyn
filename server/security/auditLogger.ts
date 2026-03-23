import { logDecisionTrace } from "../physician/auditEngine";

export interface AuditEvent {
  actor: string;
  action: string;
  patientId?: string;
  traceId?: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, any>;
  riskScore?: number;
}

export function auditLog(event: AuditEvent): void {
  const entry = {
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    actor: event.actor,
    action: event.action,
    patientId: event.patientId,
    traceId: event.traceId ?? `trace-${Date.now()}`,
    entityType: event.entityType,
    entityId: event.entityId,
    details: event.details,
    riskScore: event.riskScore,
  };

  console.log(JSON.stringify(entry));

  try {
    logDecisionTrace({
      actor: event.actor,
      action: event.action,
      entityType: (event.entityType as any) ?? "system",
      entityId: event.entityId ?? event.patientId ?? "unknown",
      after: { action: event.action, ...(event.details ?? {}) },
      approved: true,
      notes: `traceId: ${entry.traceId}`,
      riskScore: event.riskScore,
    });
  } catch {}
}

export function auditDecision(params: {
  actor: string;
  patientId: string;
  decision: string;
  riskScore: number;
  approved: boolean;
}): void {
  auditLog({
    actor: params.actor,
    action: params.approved ? "decision_approved" : "decision_blocked",
    patientId: params.patientId,
    entityType: "clinical_decision",
    entityId: params.patientId,
    riskScore: params.riskScore,
    details: { decision: params.decision, approved: params.approved },
  });
}

export function auditAccess(params: {
  actor: string;
  resource: string;
  patientId?: string;
}): void {
  auditLog({
    actor: params.actor,
    action: "resource_accessed",
    patientId: params.patientId,
    entityType: "resource",
    entityId: params.resource,
  });
}
