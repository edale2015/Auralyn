import { DetectedError } from "./errorDetectionEngine";

export interface AutoFix {
  id: string;
  caseId: string;
  complaint: string;
  type: "RULE_ADD" | "RULE_MODIFY" | "QUESTION_ADD" | "ESCALATION_THRESHOLD" | "RED_FLAG_ADD";
  suggestion: string;
  rationale: string;
  confidence: number;
  severity: string;
  status: "pending" | "approved" | "rejected" | "applied";
  createdAt: string;
}

let fixCounter = 0;

export function generateFixes(errors: DetectedError[]): AutoFix[] {
  return errors.map(e => {
    fixCounter++;
    const id = `fix_${fixCounter}_${Date.now()}`;

    if (e.severity === "CRITICAL") {
      return {
        id,
        caseId: e.caseId,
        complaint: e.complaint,
        type: "RULE_ADD" as const,
        suggestion: `Add auto-escalation rule: If ${e.missingSignals[0] || "high_risk_symptom"} present for ${e.complaint} → force ER escalation`,
        rationale: `Patient was under-triaged to ${e.predictedTriage} but actually needed ${e.actualTriage}. Missing signals: ${e.missingSignals.join(", ") || "none detected"}`,
        confidence: 0.9,
        severity: e.severity,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
    }

    if (e.severity === "HIGH" && e.missingSignals.length > 0) {
      return {
        id,
        caseId: e.caseId,
        complaint: e.complaint,
        type: "RED_FLAG_ADD" as const,
        suggestion: `Add red flag detection for "${e.missingSignals[0]}" in ${e.complaint} pack`,
        rationale: `Signal "${e.missingSignals[0]}" was missed, leading to incorrect triage from ${e.predictedTriage} to ${e.actualTriage}`,
        confidence: 0.8,
        severity: e.severity,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
    }

    if (e.diagnosisError) {
      return {
        id,
        caseId: e.caseId,
        complaint: e.complaint,
        type: "QUESTION_ADD" as const,
        suggestion: `Add discriminating question to differentiate ${e.predictedDiagnosis} from ${e.actualDiagnosis} in ${e.complaint} pack`,
        rationale: `Diagnosis mismatch: predicted ${e.predictedDiagnosis} but actual was ${e.actualDiagnosis}. Additional questions needed to improve differential.`,
        confidence: 0.7,
        severity: e.severity,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
    }

    return {
      id,
      caseId: e.caseId,
      complaint: e.complaint,
      type: "ESCALATION_THRESHOLD" as const,
      suggestion: `Lower confidence threshold for ${e.complaint} triage decisions (current confidence was ${(e.confidence * 100).toFixed(0)}%)`,
      rationale: `Triage mismatch with confidence ${(e.confidence * 100).toFixed(0)}% suggests threshold is too permissive`,
      confidence: 0.6,
      severity: e.severity,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
  });
}

const MAX_FIX_STORE = 1000;
const fixStore: AutoFix[] = [];

export function storeGeneratedFixes(fixes: AutoFix[]) {
  fixStore.push(...fixes);
  if (fixStore.length > MAX_FIX_STORE) {
    fixStore.splice(0, fixStore.length - MAX_FIX_STORE);
  }
}

export function getStoredFixes(): AutoFix[] {
  return [...fixStore];
}

export function updateFixStatus(fixId: string, status: AutoFix["status"]): AutoFix | null {
  const fix = fixStore.find(f => f.id === fixId);
  if (fix) {
    fix.status = status;
    return { ...fix };
  }
  return null;
}
