import { auditLog } from "../security/auditLogger";

export interface MalpracticeInput {
  caseId: string;
  patientId?: string;
  diagnosis: string;
  redFlags: string[];
  disposition: "ER" | "urgent_care" | "telemedicine" | "self_care" | "follow_up" | string;
  protocolDeviation: boolean;
  physicianOverrides?: number;
  modelConfidence?: number;
  complaint?: string;
  riskScore?: number;
}

export interface MalpracticeResult {
  caseId: string;
  malpracticeRisk: number;
  level: "CRITICAL" | "HIGH" | "LOW";
  triggers: string[];
  requiredActions: string[];
  auditRequired: boolean;
}

const malpracticeLog: Array<MalpracticeResult & { ts: number }> = [];

export function detectMalpracticeRisk(data: MalpracticeInput): MalpracticeResult {
  let risk = 0;
  const triggers: string[] = [];
  const requiredActions: string[] = [];

  if (data.redFlags.length > 0 && data.disposition !== "ER") {
    risk += 0.5;
    triggers.push(`red_flags_present_not_sent_to_er: [${data.redFlags.slice(0, 3).join(", ")}]`);
    requiredActions.push("Review disposition — red flags present without ER referral");
  }

  if (data.protocolDeviation) {
    risk += 0.3;
    triggers.push("protocol_deviation");
    requiredActions.push("Document protocol deviation with clinical justification");
  }

  if (data.diagnosis === "uncertain" || data.diagnosis === "unknown") {
    risk += 0.2;
    triggers.push("uncertain_diagnosis");
    requiredActions.push("Physician must review and confirm or clarify diagnosis");
  }

  if (data.physicianOverrides !== undefined && data.physicianOverrides > 3) {
    risk += 0.15;
    triggers.push(`high_override_count: ${data.physicianOverrides}`);
    requiredActions.push("Review pattern of physician overrides for this complaint");
  }

  if (data.modelConfidence !== undefined && data.modelConfidence < 0.5) {
    risk += 0.1;
    triggers.push(`low_model_confidence: ${data.modelConfidence.toFixed(2)}`);
    requiredActions.push("Low AI confidence — physician must independently verify");
  }

  if (data.riskScore !== undefined && data.riskScore >= 0.7 && data.disposition === "self_care") {
    risk += 0.4;
    triggers.push("high_risk_sent_to_self_care");
    requiredActions.push("URGENT: High-risk patient routed to self-care — immediate physician review");
  }

  const malpracticeRisk = Math.min(1, risk);
  const level: MalpracticeResult["level"] =
    malpracticeRisk >= 0.7 ? "CRITICAL" :
    malpracticeRisk >= 0.4 ? "HIGH" : "LOW";

  const auditRequired = level !== "LOW";

  const result: MalpracticeResult = {
    caseId: data.caseId,
    malpracticeRisk,
    level,
    triggers,
    requiredActions,
    auditRequired,
  };

  malpracticeLog.push({ ...result, ts: Date.now() });
  if (malpracticeLog.length > 500) malpracticeLog.shift();

  auditLog({
    actor: "malpractice_detector",
    action: "risk_assessed",
    entityId: data.caseId,
    patientId: data.patientId,
    riskScore: malpracticeRisk,
    details: { level, triggers, complaint: data.complaint },
  });

  return result;
}

export function getMalpracticeLog(limit = 50) {
  return malpracticeLog.slice(-limit);
}

export function getMalpracticeStats() {
  const recent = malpracticeLog.slice(-100);
  const byLevel = { CRITICAL: 0, HIGH: 0, LOW: 0 };
  for (const r of recent) byLevel[r.level]++;
  return {
    total: malpracticeLog.length,
    byLevel,
    criticalRate: recent.length > 0 ? byLevel.CRITICAL / recent.length : 0,
  };
}
