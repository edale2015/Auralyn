import { auditLog } from "../security/auditLogger";

export interface OutcomeRecord {
  type: "PROTOCOL_OUTCOME" | "TRIAGE_OUTCOME" | "DEVICE_ALERT" | "PHYSICIAN_OVERRIDE";
  timestamp: number;
  protocolId?: string;
  patientId?: string;
  predicted?: string;
  actual?: string;
  physicianOverride?: boolean;
  overrideTo?: string;
  riskScore?: number;
  escalated?: boolean;
  details?: Record<string, unknown>;
}

const outcomeLog: OutcomeRecord[] = [];

export function logOutcome(data: Omit<OutcomeRecord, "timestamp">): void {
  const record: OutcomeRecord = { ...data, timestamp: Date.now() };
  outcomeLog.push(record);

  console.log(JSON.stringify({ type: "OUTCOME", ...record }));

  auditLog({
    actor: "outcome_logger",
    action: data.type.toLowerCase(),
    patientId: data.patientId,
    details: data.details ?? { predicted: data.predicted, actual: data.actual },
  });
}

export function logProtocolOutcome(params: {
  protocolId: string;
  patientId?: string;
  predicted: string;
  actual: string;
  physicianOverride?: boolean;
  overrideTo?: string;
  riskScore?: number;
}): void {
  logOutcome({ type: "PROTOCOL_OUTCOME", ...params });
}

export function logPhysicianOverride(params: {
  protocolId: string;
  patientId?: string;
  originalDecision: string;
  overrideTo: string;
  reason?: string;
}): void {
  logOutcome({
    type: "PHYSICIAN_OVERRIDE",
    protocolId: params.protocolId,
    patientId: params.patientId,
    predicted: params.originalDecision,
    actual: params.overrideTo,
    overrideTo: params.overrideTo,
    physicianOverride: true,
    details: { reason: params.reason },
  });
}

export function logDeviceAlert(params: {
  device: string;
  patientId?: string;
  alert: string;
  value: unknown;
  escalated: boolean;
}): void {
  logOutcome({
    type: "DEVICE_ALERT",
    patientId: params.patientId,
    escalated: params.escalated,
    details: { device: params.device, alert: params.alert, value: params.value },
  });
}

export function getOutcomeLog(limit = 100, type?: OutcomeRecord["type"]): OutcomeRecord[] {
  const filtered = type ? outcomeLog.filter((r) => r.type === type) : outcomeLog;
  return filtered.slice(-limit);
}

export function getOutcomeSummary(): { total: number; byType: Record<string, number>; overrideRate: number } {
  const byType: Record<string, number> = {};
  for (const r of outcomeLog) byType[r.type] = (byType[r.type] ?? 0) + 1;

  const overrides = outcomeLog.filter((r) => r.physicianOverride).length;
  const total = outcomeLog.length;

  return { total, byType, overrideRate: total > 0 ? overrides / total : 0 };
}
