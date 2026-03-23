import crypto from "crypto";

export interface AuditTraceEntry {
  traceId: string;
  timestamp: string;
  actor: "system" | "physician" | "agent" | "robot";
  action: string;
  entityType: "patient" | "decision" | "template" | "robot_command" | "guardrail";
  entityId: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  approved?: boolean;
  notes?: string;
  riskScore?: number;
}

const auditLog: AuditTraceEntry[] = [];

export function logDecisionTrace(trace: Omit<AuditTraceEntry, "traceId" | "timestamp">): AuditTraceEntry {
  const entry: AuditTraceEntry = {
    ...trace,
    traceId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(entry);
  return entry;
}

export function getAuditLog(filters?: {
  actor?: AuditTraceEntry["actor"];
  entityType?: AuditTraceEntry["entityType"];
  since?: string;
  limit?: number;
}): AuditTraceEntry[] {
  let result = [...auditLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.actor) result = result.filter(e => e.actor === filters.actor);
  if (filters?.entityType) result = result.filter(e => e.entityType === filters.entityType);
  if (filters?.since) result = result.filter(e => e.timestamp >= filters.since!);

  return result.slice(0, filters?.limit ?? 100);
}

export function getAuditStats() {
  const byActor: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  let approvedCount = 0;
  let deniedCount = 0;

  for (const e of auditLog) {
    byActor[e.actor] = (byActor[e.actor] ?? 0) + 1;
    byEntity[e.entityType] = (byEntity[e.entityType] ?? 0) + 1;
    if (e.approved === true) approvedCount++;
    if (e.approved === false) deniedCount++;
  }

  return { total: auditLog.length, byActor, byEntity, approvedCount, deniedCount };
}

export function seedDemoAudit() {
  if (auditLog.length > 0) return;

  const demos: Omit<AuditTraceEntry, "traceId" | "timestamp">[] = [
    { actor: "agent", action: "triage_assigned", entityType: "patient", entityId: "demo-001", after: { triage: "routine" }, riskScore: 0.28, approved: true },
    { actor: "robot", action: "otoscope_positioned", entityType: "robot_command", entityId: "cmd-101", after: { pose: { z: 15 } }, approved: true },
    { actor: "physician", action: "decision_reviewed", entityType: "decision", entityId: "dec-201", notes: "Concurred with agent", approved: true },
    { actor: "system", action: "guardrail_blocked", entityType: "guardrail", entityId: "guard-301", before: { riskScore: 0.88 }, approved: false, notes: "High risk threshold" },
    { actor: "agent", action: "diagnosis_proposed", entityType: "decision", entityId: "dec-202", after: { diagnosis: "otitis_media" }, riskScore: 0.35, approved: true },
  ];

  for (const d of demos) logDecisionTrace(d);
}
