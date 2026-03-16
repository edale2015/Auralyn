export interface DiagnosisProbability {
  diagnosis: string;
  probability: number;
}

export interface QuestionImpactResult {
  questionId: string;
  questionText?: string;
  entropyBefore: number;
  entropyAfter: number;
  impact: number;
  impactPercent: number;
  rank: number;
}

function entropy(probs: number[]): number {
  return -probs.reduce((sum, p) => {
    if (p <= 0 || p >= 1) return sum;
    return sum + p * Math.log2(p);
  }, 0);
}

const DEMO_QUESTIONS: { id: string; text: string; yesShift: Record<string, number> }[] = [
  { id: "q_fever", text: "Do you have a fever?", yesShift: { uri: 0.1, influenza: 0.3, pneumonia: 0.2, covid: 0.2, sinusitis: -0.1, allergic_rhinitis: -0.3 } },
  { id: "q_cough", text: "Do you have a cough?", yesShift: { bronchitis: 0.3, pneumonia: 0.2, uri: 0.1, covid: 0.15, allergic_rhinitis: -0.1 } },
  { id: "q_sore_throat", text: "Do you have a sore throat?", yesShift: { strep_pharyngitis: 0.35, uri: 0.15, peritonsillar_abscess: 0.1, epiglottitis: 0.05 } },
  { id: "q_headache", text: "Do you have a headache?", yesShift: { migraine: 0.3, tension_headache: 0.3, sinusitis: 0.1, meningitis: 0.05 } },
  { id: "q_nasal_congestion", text: "Do you have nasal congestion?", yesShift: { sinusitis: 0.3, allergic_rhinitis: 0.3, uri: 0.15, covid: 0.05 } },
  { id: "q_ear_pain", text: "Do you have ear pain?", yesShift: { otitis_media: 0.5, sinusitis: 0.1, strep_pharyngitis: 0.05 } },
  { id: "q_dizziness", text: "Do you feel dizzy?", yesShift: { bppv: 0.4, meningitis: 0.1, migraine: 0.1 } },
  { id: "q_shortness_breath", text: "Are you short of breath?", yesShift: { pneumonia: 0.3, covid: 0.2, bronchitis: 0.15, epiglottitis: 0.1 } },
  { id: "q_body_aches", text: "Do you have body aches?", yesShift: { influenza: 0.3, covid: 0.2, uri: 0.05 } },
  { id: "q_neck_stiff", text: "Do you have a stiff neck?", yesShift: { meningitis: 0.5, tension_headache: 0.1 } },
];

const BASE_PROBS: Record<string, number> = {
  uri: 0.2, sinusitis: 0.1, bronchitis: 0.08, pneumonia: 0.06, influenza: 0.08,
  strep_pharyngitis: 0.08, otitis_media: 0.05, allergic_rhinitis: 0.12,
  migraine: 0.05, tension_headache: 0.08, bppv: 0.03, covid: 0.04,
  peritonsillar_abscess: 0.01, epiglottitis: 0.005, meningitis: 0.005,
};

export class QuestionImpactAnalyzer {
  analyze(
    questionId: string,
    before: DiagnosisProbability[],
    after: DiagnosisProbability[]
  ): QuestionImpactResult {
    const entropyBefore = entropy(before.map((p) => p.probability));
    const entropyAfter = entropy(after.map((p) => p.probability));
    const impact = entropyBefore - entropyAfter;

    return {
      questionId,
      entropyBefore: Number(entropyBefore.toFixed(4)),
      entropyAfter: Number(entropyAfter.toFixed(4)),
      impact: Number(impact.toFixed(4)),
      impactPercent: entropyBefore > 0 ? Number(((impact / entropyBefore) * 100).toFixed(1)) : 0,
      rank: 0,
    };
  }

  analyzeAllQuestions(): QuestionImpactResult[] {
    const baseProbList = Object.entries(BASE_PROBS).map(([d, p]) => ({ diagnosis: d, probability: p }));
    const totalBase = baseProbList.reduce((s, p) => s + p.probability, 0);
    const normalized = baseProbList.map((p) => ({ ...p, probability: p.probability / totalBase }));

    const results = DEMO_QUESTIONS.map((q) => {
      const afterProbs = normalized.map((p) => {
        const shift = q.yesShift[p.diagnosis] || 0;
        return { diagnosis: p.diagnosis, probability: Math.max(0.001, Math.min(0.99, p.probability + shift * 0.3)) };
      });
      const totalAfter = afterProbs.reduce((s, p) => s + p.probability, 0);
      const normalizedAfter = afterProbs.map((p) => ({ ...p, probability: p.probability / totalAfter }));

      const result = this.analyze(q.id, normalized, normalizedAfter);
      result.questionText = q.text;
      return result;
    });

    results.sort((a, b) => b.impact - a.impact);
    results.forEach((r, i) => (r.rank = i + 1));
    return results;
  }
}

export const questionImpactAnalyzer = new QuestionImpactAnalyzer();
