export interface CaseData {
  caseId: string;
  complaint: string;
  diagnosis: string;
  triage: string;
  symptoms: string[];
  questionsAsked: string[];
  rulesTriggered: string[];
  confidence: number;
  timestamp?: number;
}

export interface ActualOutcome {
  diagnosis: string;
  triage: string;
  admittedToER?: boolean;
  followUpNeeded?: boolean;
  missedSignals?: string[];
}

export interface FeedbackLog {
  caseId: string;
  complaint: string;
  predictedDiagnosis: string;
  actualDiagnosis: string;
  predictedTriage: string;
  actualTriage: string;
  missingSignals: string[];
  confidence: number;
  timestamp: number;
}

function detectMissingSignals(caseData: CaseData, actualOutcome: ActualOutcome): string[] {
  const missing: string[] = [];

  if (actualOutcome.missedSignals) {
    missing.push(...actualOutcome.missedSignals);
  }

  if (actualOutcome.triage === "er_now" && caseData.triage !== "er_now") {
    missing.push("under_triaged_to_er");
  }

  if (actualOutcome.admittedToER && !caseData.rulesTriggered.some(r => r.includes("escalat"))) {
    missing.push("escalation_rule_missing");
  }

  return missing;
}

const feedbackStore: FeedbackLog[] = [];

export function ingestOutcome(caseData: CaseData, actualOutcome: ActualOutcome): FeedbackLog {
  const log: FeedbackLog = {
    caseId: caseData.caseId,
    complaint: caseData.complaint,
    predictedDiagnosis: caseData.diagnosis,
    actualDiagnosis: actualOutcome.diagnosis,
    predictedTriage: caseData.triage,
    actualTriage: actualOutcome.triage,
    missingSignals: detectMissingSignals(caseData, actualOutcome),
    confidence: caseData.confidence,
    timestamp: Date.now(),
  };

  feedbackStore.push(log);
  return log;
}

export function getFeedbackLogs(): FeedbackLog[] {
  return [...feedbackStore];
}

export function getFeedbackStats() {
  const total = feedbackStore.length;
  const diagnosisMismatches = feedbackStore.filter(l => l.predictedDiagnosis !== l.actualDiagnosis).length;
  const triageMismatches = feedbackStore.filter(l => l.predictedTriage !== l.actualTriage).length;
  const criticalMisses = feedbackStore.filter(l =>
    l.actualTriage === "er_now" && l.predictedTriage !== "er_now"
  ).length;

  return {
    total,
    diagnosisMismatches,
    triageMismatches,
    criticalMisses,
    diagnosisAccuracy: total > 0 ? ((total - diagnosisMismatches) / total * 100).toFixed(1) : "N/A",
    triageAccuracy: total > 0 ? ((total - triageMismatches) / total * 100).toFixed(1) : "N/A",
  };
}

export function seedDemoFeedback() {
  if (feedbackStore.length > 0) return 0;

  const demos: Array<{ case: CaseData; outcome: ActualOutcome }> = [
    {
      case: { caseId: "demo_1", complaint: "chest_pain", diagnosis: "GERD", triage: "telemed_now", symptoms: ["heartburn", "chest_tightness"], questionsAsked: ["sob", "radiation"], rulesTriggered: [], confidence: 0.7 },
      outcome: { diagnosis: "unstable_angina", triage: "er_now", admittedToER: true, missedSignals: ["exertional_pattern"] },
    },
    {
      case: { caseId: "demo_2", complaint: "headache", diagnosis: "tension_headache", triage: "self_care", symptoms: ["frontal_pain", "stress"], questionsAsked: ["vision", "fever"], rulesTriggered: [], confidence: 0.85 },
      outcome: { diagnosis: "tension_headache", triage: "self_care" },
    },
    {
      case: { caseId: "demo_3", complaint: "cough", diagnosis: "bronchitis", triage: "telemed_now", symptoms: ["cough", "mucus"], questionsAsked: ["duration", "fever"], rulesTriggered: [], confidence: 0.75 },
      outcome: { diagnosis: "pneumonia", triage: "urgent_care", missedSignals: ["high_fever_missed"] },
    },
    {
      case: { caseId: "demo_4", complaint: "back_pain", diagnosis: "muscle_strain", triage: "self_care", symptoms: ["lumbar_pain"], questionsAsked: ["injury", "weakness"], rulesTriggered: [], confidence: 0.8 },
      outcome: { diagnosis: "muscle_strain", triage: "self_care" },
    },
    {
      case: { caseId: "demo_5", complaint: "abdominal_pain", diagnosis: "gastritis", triage: "telemed_now", symptoms: ["epigastric_pain", "nausea"], questionsAsked: ["vomiting", "blood"], rulesTriggered: [], confidence: 0.65 },
      outcome: { diagnosis: "appendicitis", triage: "er_now", admittedToER: true, missedSignals: ["RLQ_migration", "rebound_tenderness"] },
    },
    {
      case: { caseId: "demo_6", complaint: "sore_throat", diagnosis: "pharyngitis", triage: "self_care", symptoms: ["throat_pain"], questionsAsked: ["fever", "swelling"], rulesTriggered: [], confidence: 0.9 },
      outcome: { diagnosis: "pharyngitis", triage: "self_care" },
    },
  ];

  for (const d of demos) {
    ingestOutcome(d.case, d.outcome);
  }
  return demos.length;
}
