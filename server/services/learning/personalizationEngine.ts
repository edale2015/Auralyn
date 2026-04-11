import type { PatientPatterns } from "./patientMemoryService";

export interface PersonalizationInput {
  baseProbability: number;
  comorbidities: string[];
  patientPattern: PatientPatterns;
}

export interface PersonalizationResult {
  adjustedProbability: number;
  appliedAdjustments: string[];
}

export function personalizeDecision(input: PersonalizationInput): PersonalizationResult {
  let adjusted = input.baseProbability;
  const appliedAdjustments: string[] = [];

  if (input.comorbidities.includes("immunocompromised")) {
    adjusted += 0.2;
    appliedAdjustments.push("+0.20 immunocompromised");
  }

  if (input.comorbidities.includes("chronic_lung_disease")) {
    adjusted += 0.1;
    appliedAdjustments.push("+0.10 chronic_lung_disease");
  }

  if (input.comorbidities.includes("diabetes")) {
    adjusted += 0.1;
    appliedAdjustments.push("+0.10 diabetes");
  }

  if (input.patientPattern.antibioticResponseRate > 0.7) {
    adjusted += 0.1;
    appliedAdjustments.push("+0.10 strong historical antibiotic response");
  }

  if (input.patientPattern.frequentReturner) {
    adjusted += 0.05;
    appliedAdjustments.push("+0.05 frequent returner pattern");
  }

  const result = Math.min(adjusted, 0.95);

  return {
    adjustedProbability: Math.round(result * 1000) / 1000,
    appliedAdjustments,
  };
}
