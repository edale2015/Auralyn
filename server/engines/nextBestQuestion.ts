export interface DiagnosisEntry {
  diagnosis: string;
  probability: number;
}

export interface Question {
  id: string;
  question: string;
  affects: string[];
  weight: number;
  alreadyAsked?: boolean;
}

export interface NextBestQuestionResult {
  question: string | null;
  questionId: string | null;
  expectedImpact: number;
  rankedQuestions: { id: string; question: string; infoGain: number }[];
}

export function getNextBestQuestion(
  differential: DiagnosisEntry[],
  questions: Question[]
): NextBestQuestionResult {
  const candidates = questions.filter((q) => !q.alreadyAsked);

  if (candidates.length === 0 || differential.length === 0) {
    return { question: null, questionId: null, expectedImpact: 0, rankedQuestions: [] };
  }

  const scored = candidates.map((q) => {
    let infoGain = 0;
    for (const dx of differential) {
      if (q.affects.includes(dx.diagnosis)) {
        infoGain += dx.probability * q.weight;
      }
    }
    return { id: q.id, question: q.question, infoGain: Math.round(infoGain * 1000) / 1000 };
  });

  const ranked = scored.sort((a, b) => b.infoGain - a.infoGain);
  const best   = ranked[0];

  return {
    question:        best?.question ?? null,
    questionId:      best?.id ?? null,
    expectedImpact:  best?.infoGain ?? 0,
    rankedQuestions: ranked,
  };
}

export function buildSoreThroatQuestions(): Question[] {
  return [
    { id: "q_fever",   question: "Does the patient have fever (temp ≥38.0°C)?",        affects: ["strep_pharyngitis", "peritonsillar_abscess"],        weight: 1.2 },
    { id: "q_exudate", question: "Is there tonsillar exudate present?",                  affects: ["strep_pharyngitis", "infectious_mononucleosis"],       weight: 1.3 },
    { id: "q_nodes",   question: "Are anterior cervical lymph nodes tender?",            affects: ["strep_pharyngitis"],                                   weight: 1.1 },
    { id: "q_cough",   question: "Does the patient have cough?",                         affects: ["viral_pharyngitis", "covid19"],                        weight: 0.9 },
    { id: "q_rash",    question: "Is there a sandpaper rash (scarlatiniform)?",          affects: ["strep_pharyngitis"],                                   weight: 1.5 },
    { id: "q_mono",    question: "Is there posterior lymphadenopathy or splenomegaly?",  affects: ["infectious_mononucleosis"],                            weight: 1.4 },
    { id: "q_duration","question": "Symptoms started within the last 72 hours?",         affects: ["strep_pharyngitis", "peritonsillar_abscess"],           weight: 0.8 },
  ];
}
