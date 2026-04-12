/**
 * Decision Temperature Engine
 * Inspired by colour temperature: cold = strict/deterministic (high risk),
 * warm = flexible/probabilistic (low risk).
 *
 * Cold decisions lock to 1 diagnosis + physician review.
 * Warm decisions open all diagnoses.
 */

import type { ClinicalTokenSet } from "../core/clinicalTokens";

export type Temperature = "cold" | "cool" | "warm" | "hot";

export interface TemperatureResult {
  temperature:  Temperature;
  riskLevel:    ClinicalTokenSet["riskLevel"];
  allowedCount: number;
}

export function applyDecisionTemperature(tokens: ClinicalTokenSet): ClinicalTokenSet {
  const maxProb = Object.values(tokens.posterior).length
    ? Math.max(...Object.values(tokens.posterior))
    : 0;

  // Risk classification
  if (tokens.redFlags.length > 0 || tokens.modifiers.hypotension || tokens.modifiers.hypoxia) {
    tokens.riskLevel = "critical";
  } else if (maxProb > 0.8 || tokens.modifiers.tachycardia) {
    tokens.riskLevel = "high";
  } else if (maxProb > 0.5 || tokens.modifiers.fever) {
    tokens.riskLevel = "moderate";
  } else {
    tokens.riskLevel = "low";
  }

  // Temperature rules — controls how many diagnoses are "in play"
  switch (tokens.riskLevel) {
    case "critical":
      tokens.requiresPhysicianReview = true;
      tokens.allowedDiagnoses        = topDiagnoses(tokens, 1);
      break;

    case "high":
      tokens.allowedDiagnoses = topDiagnoses(tokens, 2);
      break;

    case "moderate":
      tokens.allowedDiagnoses = topDiagnoses(tokens, 3);
      break;

    case "low":
    default:
      tokens.allowedDiagnoses = Object.keys(tokens.posterior);
      break;
  }

  return tokens;
}

export function getTemperatureLabel(riskLevel: ClinicalTokenSet["riskLevel"]): Temperature {
  const map: Record<ClinicalTokenSet["riskLevel"], Temperature> = {
    critical: "cold",
    high:     "cool",
    moderate: "warm",
    low:      "hot",
  };
  return map[riskLevel];
}

function topDiagnoses(tokens: ClinicalTokenSet, n: number): string[] {
  return Object.entries(tokens.posterior)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([dx]) => dx);
}
