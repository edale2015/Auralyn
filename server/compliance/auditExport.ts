import { MODEL_VERSION } from "./modelRegistry";
import { classifyRisk, type RiskClassification } from "./riskEngine";

export interface CaseAuditBundle {
  exportId: string;
  modelVersion: string;
  complaint: string;
  diagnosis?: string;
  triage?: string;
  riskClassification: RiskClassification;
  decisions: any;
  timestamp: string;
  exportedAt: string;
}

let exportCounter = 0;

export function exportCaseAudit(trace: {
  complaint: string;
  diagnosis?: string;
  triage?: string;
  [key: string]: any;
}): CaseAuditBundle {
  exportCounter++;
  const risk = classifyRisk({
    triage: trace.triage,
    diagnosis: trace.diagnosis,
    confidence: trace.confidence,
  });

  return {
    exportId: `AUDIT-${exportCounter.toString().padStart(6, "0")}`,
    modelVersion: MODEL_VERSION,
    complaint: trace.complaint,
    diagnosis: trace.diagnosis,
    triage: trace.triage,
    riskClassification: risk,
    decisions: trace,
    timestamp: trace.timestamp || new Date().toISOString(),
    exportedAt: new Date().toISOString(),
  };
}
