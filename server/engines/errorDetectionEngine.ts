import { FeedbackLog } from "./feedbackEngine";

export interface DetectedError {
  caseId: string;
  complaint: string;
  diagnosisError: boolean;
  triageError: boolean;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  predictedDiagnosis: string;
  actualDiagnosis: string;
  predictedTriage: string;
  actualTriage: string;
  missingSignals: string[];
  confidence: number;
}

export function detectErrors(feedbackLogs: FeedbackLog[]): DetectedError[] {
  return feedbackLogs
    .map(log => {
      const diagnosisError = log.predictedDiagnosis !== log.actualDiagnosis;
      const triageError = log.predictedTriage !== log.actualTriage;

      if (!diagnosisError && !triageError) return null;

      let severity: DetectedError["severity"] = "LOW";
      if (log.actualTriage === "er_now" && log.predictedTriage !== "er_now") {
        severity = "CRITICAL";
      } else if (log.actualTriage === "urgent_care" && log.predictedTriage === "self_care") {
        severity = "HIGH";
      } else if (diagnosisError && triageError) {
        severity = "HIGH";
      } else if (diagnosisError || triageError) {
        severity = "MODERATE";
      }

      return {
        caseId: log.caseId,
        complaint: log.complaint,
        diagnosisError,
        triageError,
        severity,
        predictedDiagnosis: log.predictedDiagnosis,
        actualDiagnosis: log.actualDiagnosis,
        predictedTriage: log.predictedTriage,
        actualTriage: log.actualTriage,
        missingSignals: log.missingSignals,
        confidence: log.confidence,
      };
    })
    .filter((e): e is DetectedError => e !== null);
}

export function groupErrorsByComplaint(errors: DetectedError[]): Record<string, DetectedError[]> {
  const map: Record<string, DetectedError[]> = {};
  for (const e of errors) {
    if (!map[e.complaint]) map[e.complaint] = [];
    map[e.complaint].push(e);
  }
  return map;
}

export function getErrorSummary(errors: DetectedError[]) {
  const total = errors.length;
  const critical = errors.filter(e => e.severity === "CRITICAL").length;
  const high = errors.filter(e => e.severity === "HIGH").length;
  const moderate = errors.filter(e => e.severity === "MODERATE").length;
  const low = errors.filter(e => e.severity === "LOW").length;

  const byComplaint = groupErrorsByComplaint(errors);
  const worstComplaints = Object.entries(byComplaint)
    .map(([complaint, errs]) => ({
      complaint,
      errorCount: errs.length,
      criticalCount: errs.filter(e => e.severity === "CRITICAL").length,
    }))
    .sort((a, b) => b.criticalCount - a.criticalCount || b.errorCount - a.errorCount)
    .slice(0, 10);

  return { total, critical, high, moderate, low, worstComplaints };
}
