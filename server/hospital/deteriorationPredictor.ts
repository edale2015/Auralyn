/**
 * Deterioration Predictor — "Don't let the quiet patient quietly worsen"
 *
 * Computes a risk score for each patient based on age, vitals, safety
 * disposition, chief complaint, and symptom flags. Higher scores trigger
 * escalation to in-person care rather than telemed or home routing.
 *
 * This is intentionally rule-weighted rather than ML-driven, which means it
 * is interpretable, auditable, and predictable — important properties for
 * a system making clinical routing recommendations.
 */

export interface DeteriorationInput {
  ageYears?:          number;
  complaint:          string;
  symptoms:           string[];
  vitals:             Record<string, number>;
  safetyDisposition:  "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE";
  differential:       Array<{ diagnosis: string; probability: number }>;
}

export interface DeteriorationResult {
  score:                             number;
  riskLevel:                         "low" | "medium" | "high";
  predictedNeedForEscalation:        boolean;
  estimatedTimeToConcernMinutes:     number;
}

export function predictPatientDeterioration(input: DeteriorationInput): DeteriorationResult {
  let score = 0;

  // Age risk
  if ((input.ageYears ?? 0) >= 65) score += 1;

  // Safety disposition weight
  if (input.safetyDisposition === "URGENT")  score += 2;
  if (input.safetyDisposition === "ER_NOW")  score += 5;

  // Vital sign scoring
  const systolic = input.vitals.systolicBp         ?? 120;
  const spo2     = input.vitals.oxygenSaturation   ?? 98;
  const rr       = input.vitals.respiratoryRate     ?? 16;
  const hr       = input.vitals.heartRate           ?? 80;

  if (systolic <= 100) score += 2;
  if (spo2 < 92)       score += 3;
  if (rr >= 22)        score += 2;
  if (hr >= 120)       score += 2;

  // High-acuity chief complaints
  if (input.complaint === "chest_pain")           score += 2;
  if (input.complaint === "shortness_of_breath")  score += 2;
  if (input.complaint === "fever")                score += 1;

  // Danger-sign symptoms
  if (input.symptoms.includes("confusion"))       score += 2;
  if (input.symptoms.includes("syncope"))         score += 2;
  if (input.symptoms.includes("heavy_bleeding"))  score += 4;

  // High-confidence differential adds marginal risk
  const topDx = input.differential[0];
  if (topDx && topDx.probability > 0.7) score += 1;

  const riskLevel: DeteriorationResult["riskLevel"] =
    score >= 8 ? "high"   :
    score >= 4 ? "medium" : "low";

  return {
    score,
    riskLevel,
    predictedNeedForEscalation:    riskLevel !== "low",
    estimatedTimeToConcernMinutes:
      riskLevel === "high"   ? 15  :
      riskLevel === "medium" ? 60  : 240,
  };
}
