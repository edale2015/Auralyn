export interface StrepFeatures {
  fever: boolean;
  exudate: boolean;
  nodes: boolean;
  cough: boolean;
}

export function calculateStrepProbability(features: StrepFeatures): number {
  let probability = 0.1;

  if (features.fever)   probability += 0.20;
  if (features.exudate) probability += 0.25;
  if (features.nodes)   probability += 0.20;
  if (!features.cough)  probability += 0.15;

  return Math.min(probability, 0.95);
}

export function strepRiskLabel(probability: number): "low" | "moderate" | "high" {
  if (probability >= 0.6) return "high";
  if (probability >= 0.35) return "moderate";
  return "low";
}

export function strepTreatmentRecommendation(probability: number, centorScore: number): string {
  if (probability >= 0.6 || centorScore >= 4) {
    return "Empiric antibiotic treatment supported by combined evidence.";
  }
  if (probability >= 0.35 || (centorScore === 2 || centorScore === 3)) {
    return "Rapid strep test or delayed prescription strategy recommended.";
  }
  return "Low probability of bacterial pharyngitis. Supportive care preferred.";
}
