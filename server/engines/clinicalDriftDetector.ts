export interface CaseResult {
  caseId: string;
  diagnosis: string;
  disposition: string;
  confidence: number;
}

export interface DriftReport {
  diagnosisChangeRate: number;
  dispositionChangeRate: number;
  confidenceShift: number;
  totalCases: number;
  changedDiagnoses: string[];
  changedDispositions: string[];
  severity: "none" | "low" | "moderate" | "high" | "critical";
  timestamp: number;
}

const BASELINE_CASES: CaseResult[] = [
  { caseId: "b001", diagnosis: "URI", disposition: "self_care", confidence: 0.85 },
  { caseId: "b002", diagnosis: "Sinusitis", disposition: "self_care_followup", confidence: 0.78 },
  { caseId: "b003", diagnosis: "Strep Pharyngitis", disposition: "urgent", confidence: 0.82 },
  { caseId: "b004", diagnosis: "Otitis Media", disposition: "urgent", confidence: 0.75 },
  { caseId: "b005", diagnosis: "Pneumonia", disposition: "er", confidence: 0.88 },
  { caseId: "b006", diagnosis: "Migraine", disposition: "self_care", confidence: 0.70 },
  { caseId: "b007", diagnosis: "Influenza", disposition: "self_care_followup", confidence: 0.80 },
  { caseId: "b008", diagnosis: "BPPV", disposition: "urgent", confidence: 0.72 },
  { caseId: "b009", diagnosis: "Allergic Rhinitis", disposition: "self_care", confidence: 0.90 },
  { caseId: "b010", diagnosis: "COVID-19", disposition: "urgent", confidence: 0.76 },
];

const CURRENT_CASES: CaseResult[] = [
  { caseId: "b001", diagnosis: "URI", disposition: "self_care", confidence: 0.87 },
  { caseId: "b002", diagnosis: "Sinusitis", disposition: "self_care_followup", confidence: 0.80 },
  { caseId: "b003", diagnosis: "Strep Pharyngitis", disposition: "urgent", confidence: 0.84 },
  { caseId: "b004", diagnosis: "Otitis Media", disposition: "self_care_followup", confidence: 0.68 },
  { caseId: "b005", diagnosis: "Pneumonia", disposition: "er", confidence: 0.91 },
  { caseId: "b006", diagnosis: "Tension Headache", disposition: "self_care", confidence: 0.65 },
  { caseId: "b007", diagnosis: "Influenza", disposition: "self_care_followup", confidence: 0.82 },
  { caseId: "b008", diagnosis: "BPPV", disposition: "urgent", confidence: 0.74 },
  { caseId: "b009", diagnosis: "Allergic Rhinitis", disposition: "self_care", confidence: 0.92 },
  { caseId: "b010", diagnosis: "COVID-19", disposition: "self_care_followup", confidence: 0.71 },
];

export class ClinicalDriftDetector {
  detect(baseline?: CaseResult[], current?: CaseResult[]): DriftReport {
    const base = baseline?.length ? baseline : BASELINE_CASES;
    const curr = current?.length ? current : CURRENT_CASES;
    const len = Math.min(base.length, curr.length);

    let diagnosisChanges = 0;
    let dispositionChanges = 0;
    let confidenceShift = 0;
    const changedDiagnoses: string[] = [];
    const changedDispositions: string[] = [];

    for (let i = 0; i < len; i++) {
      if (base[i].diagnosis !== curr[i].diagnosis) {
        diagnosisChanges++;
        changedDiagnoses.push(`${base[i].caseId}: ${base[i].diagnosis} → ${curr[i].diagnosis}`);
      }
      if (base[i].disposition !== curr[i].disposition) {
        dispositionChanges++;
        changedDispositions.push(`${base[i].caseId}: ${base[i].disposition} → ${curr[i].disposition}`);
      }
      confidenceShift += Math.abs(base[i].confidence - curr[i].confidence);
    }

    const diagRate = diagnosisChanges / len;
    const dispRate = dispositionChanges / len;
    const avgConfShift = confidenceShift / len;

    let severity: DriftReport["severity"] = "none";
    if (diagRate > 0.3 || dispRate > 0.3) severity = "critical";
    else if (diagRate > 0.2 || dispRate > 0.2) severity = "high";
    else if (diagRate > 0.1 || dispRate > 0.1) severity = "moderate";
    else if (diagRate > 0 || dispRate > 0) severity = "low";

    return {
      diagnosisChangeRate: Number(diagRate.toFixed(4)),
      dispositionChangeRate: Number(dispRate.toFixed(4)),
      confidenceShift: Number(avgConfShift.toFixed(4)),
      totalCases: len,
      changedDiagnoses,
      changedDispositions,
      severity,
      timestamp: Date.now(),
    };
  }
}

export const clinicalDriftDetector = new ClinicalDriftDetector();
