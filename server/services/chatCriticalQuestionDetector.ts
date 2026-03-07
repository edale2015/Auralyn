export interface CriticalQuestionInput {
  complaintId: string;
  answers: Record<string, unknown>;
  triggeredRedFlags: string[];
  recommendedDisposition?: string;
}

export interface CriticalQuestionResult {
  criticalTokens: string[];
}

const RED_FLAG_FOLLOWUPS: Record<string, string[]> = {
  RF_ST_AIRWAY: ["Q_STRIDOR", "Q_SHORTNESS_OF_BREATH"],
  RF_ST_PERITONSILLAR: ["Q_TRISMUS", "Q_MUFFLED_VOICE"],
  RF_ST_DYSPNEA: ["Q_SHORTNESS_OF_BREATH"],
  RF_ST_NECK_SWELLING: ["Q_NECK_SWELLING"],
};

export function detectCriticalQuestions(input: CriticalQuestionInput): CriticalQuestionResult {
  const { answers, triggeredRedFlags } = input;
  const critical: string[] = [];

  for (const rf of triggeredRedFlags) {
    const followups = RED_FLAG_FOLLOWUPS[rf];
    if (!followups) continue;
    for (const token of followups) {
      const val = answers[token];
      if (val === undefined || val === null || val === "") {
        if (!critical.includes(token)) critical.push(token);
      }
    }
  }

  return { criticalTokens: critical };
}
