export interface ReasoningResult {
  topDiagnosis: string;
  differentials: { diagnosis: string; probability: number }[];
  confidence: number;
  method: string;
}

export class ReasoningLayer {
  run(symptoms: string[], diagnoses: { name: string; confidence: number }[]): ReasoningResult {
    if (!diagnoses.length) {
      return {
        topDiagnosis: "Unknown",
        differentials: [],
        confidence: 0,
        method: "bayesian_weighted",
      };
    }

    const total = diagnoses.reduce((s, d) => s + d.confidence, 0);
    const differentials = diagnoses.map((d) => ({
      diagnosis: d.name,
      probability: Number((d.confidence / total).toFixed(4)),
    }));

    differentials.sort((a, b) => b.probability - a.probability);

    const symptomBoost = Math.min(symptoms.length * 0.02, 0.1);
    const topConfidence = Math.min(0.98, differentials[0].probability + symptomBoost);

    return {
      topDiagnosis: differentials[0].diagnosis,
      differentials,
      confidence: Number(topConfidence.toFixed(4)),
      method: "bayesian_weighted",
    };
  }
}

export const reasoningLayer = new ReasoningLayer();
