import { calculateCentorScore, centorDecision } from "./centorEngine";
import { calculateStrepProbability } from "./bayesianStrepEngine";
import { calculateConfidence, type ConfidenceTier } from "./confidenceEngine";

export interface ClinicalInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderAnteriorCervicalNodes: boolean;
  absenceOfCough: boolean;
  age: number;
}

export interface ClinicalOutput {
  centorScore:           number;
  centorRecommendation:  string;
  probability:           number;
  finalDecision:         "ANTIBIOTIC" | "TEST_OR_DELAYED" | "NO_ANTIBIOTIC";
  confidence:            ConfidenceTier;
  reasoning:             string[];
}

export function runClinicalDecision(input: ClinicalInput): ClinicalOutput {
  const reasoning: string[] = [];

  const centorScore          = calculateCentorScore(input);
  const centorRecommendation = centorDecision(centorScore);

  reasoning.push(`Centor score: ${centorScore} → ${centorRecommendation}`);

  const probability = calculateStrepProbability({
    fever:   input.fever,
    exudate: input.tonsillarExudate,
    nodes:   input.tenderAnteriorCervicalNodes,
    cough:   !input.absenceOfCough,
  });

  reasoning.push(`Estimated bacterial probability: ${probability.toFixed(2)}`);

  let finalDecision: ClinicalOutput["finalDecision"] = "NO_ANTIBIOTIC";

  if (centorScore >= 4 || probability > 0.65) {
    finalDecision = "ANTIBIOTIC";
    reasoning.push("High clinical likelihood → empiric antibiotic treatment");
  } else if (centorScore >= 2 || probability > 0.4) {
    finalDecision = "TEST_OR_DELAYED";
    reasoning.push("Intermediate risk → rapid strep test or delayed Rx");
  } else {
    reasoning.push("Low likelihood → supportive care; antibiotics not indicated");
  }

  const confidence = calculateConfidence(probability);

  return {
    centorScore,
    centorRecommendation,
    probability,
    finalDecision,
    confidence,
    reasoning,
  };
}
