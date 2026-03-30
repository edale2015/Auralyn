/**
 * DOMAIN 1 — REC 1.4: Age-Stratified Pediatric Safety Rules
 *
 * Implements age-banded safety thresholds for:
 *   - Fever (temperature thresholds vary dramatically by age)
 *   - Respiratory rate (tachypnea definition changes with age)
 *   - Heart rate (tachycardia definition changes with age)
 *   - O2 saturation (stricter cutoff under 6 months)
 *
 * MY ADDITION: Weight-based dosing flag and sepsis screening criteria
 * (Pediatric SIRS criteria) are included per AAP and ACEP guidelines.
 */

export interface PediatricAgeband {
  label:              string;
  minAgeMonths:       number;
  maxAgeMonths:       number;
  feverThresholdC:    number;   // Any temp at or above this = hard stop
  respRateThreshold:  number;   // breaths/min above this = tachypnea
  heartRateThreshold: number;   // bpm above this = tachycardia
  o2SatThreshold:     number;   // SpO2 below this = critical
  requiresWeightForDosing: boolean;
  hardStopDisposition: "ER_NOW" | "ER_URGENT";
  sirsMinCriteria:    number;   // MY ADDITION: how many SIRS criteria = sepsis screen
}

export const PEDIATRIC_AGE_BANDS: PediatricAgeband[] = [
  {
    label: "Neonate (0–1 month)",
    minAgeMonths: 0, maxAgeMonths: 1,
    feverThresholdC: 38.0, respRateThreshold: 60, heartRateThreshold: 180,
    o2SatThreshold: 94, requiresWeightForDosing: true,
    hardStopDisposition: "ER_NOW", sirsMinCriteria: 1,
  },
  {
    label: "Young Infant (1–3 months)",
    minAgeMonths: 1, maxAgeMonths: 3,
    feverThresholdC: 38.0, respRateThreshold: 60, heartRateThreshold: 180,
    o2SatThreshold: 94, requiresWeightForDosing: true,
    hardStopDisposition: "ER_NOW", sirsMinCriteria: 1,
  },
  {
    label: "Infant (3–12 months)",
    minAgeMonths: 3, maxAgeMonths: 12,
    feverThresholdC: 38.5, respRateThreshold: 50, heartRateThreshold: 160,
    o2SatThreshold: 93, requiresWeightForDosing: true,
    hardStopDisposition: "ER_NOW", sirsMinCriteria: 2,
  },
  {
    label: "Toddler (1–3 years)",
    minAgeMonths: 12, maxAgeMonths: 36,
    feverThresholdC: 39.0, respRateThreshold: 40, heartRateThreshold: 150,
    o2SatThreshold: 93, requiresWeightForDosing: true,
    hardStopDisposition: "ER_URGENT", sirsMinCriteria: 2,
  },
  {
    label: "Preschool (3–6 years)",
    minAgeMonths: 36, maxAgeMonths: 72,
    feverThresholdC: 39.5, respRateThreshold: 34, heartRateThreshold: 140,
    o2SatThreshold: 92, requiresWeightForDosing: false,
    hardStopDisposition: "ER_URGENT", sirsMinCriteria: 2,
  },
  {
    label: "School Age (6–12 years)",
    minAgeMonths: 72, maxAgeMonths: 144,
    feverThresholdC: 39.5, respRateThreshold: 30, heartRateThreshold: 130,
    o2SatThreshold: 92, requiresWeightForDosing: false,
    hardStopDisposition: "ER_URGENT", sirsMinCriteria: 2,
  },
  {
    label: "Adolescent (12–18 years)",
    minAgeMonths: 144, maxAgeMonths: 216,
    feverThresholdC: 39.5, respRateThreshold: 20, heartRateThreshold: 110,
    o2SatThreshold: 92, requiresWeightForDosing: false,
    hardStopDisposition: "ER_URGENT", sirsMinCriteria: 2,
  },
];

export function getPediatricBand(ageMonths: number): PediatricAgeband | null {
  return PEDIATRIC_AGE_BANDS.find(
    b => ageMonths >= b.minAgeMonths && ageMonths < b.maxAgeMonths
  ) ?? null;
}

export interface PediatricSafetyResult {
  isHighRisk:       boolean;
  disposition?:     "ER_NOW" | "ER_URGENT";
  triggers:         string[];
  band?:            PediatricAgeband;
  sirsScore:        number;       // MY ADDITION
  requiresWeightCheck: boolean;
}

export function evaluatePediatricSafety(params: {
  ageMonths:      number;
  temperatureC?:  number;
  respiratoryRate?: number;
  heartRate?:     number;
  o2Saturation?:  number;
  weightKg?:      number;
}): PediatricSafetyResult {
  const { ageMonths, temperatureC, respiratoryRate, heartRate, o2Saturation } = params;
  const band = getPediatricBand(ageMonths);

  if (!band) {
    return { isHighRisk: false, triggers: [], sirsScore: 0, requiresWeightCheck: false };
  }

  const triggers: string[] = [];
  let sirsScore = 0;

  if (temperatureC !== undefined) {
    if (temperatureC >= band.feverThresholdC) {
      triggers.push(`Fever ${temperatureC}°C ≥ ${band.feverThresholdC}°C threshold for ${band.label}`);
      sirsScore++;
    }
  }

  if (respiratoryRate !== undefined && respiratoryRate > band.respRateThreshold) {
    triggers.push(`Tachypnea: ${respiratoryRate} bpm > ${band.respRateThreshold} for ${band.label}`);
    sirsScore++;
  }

  if (heartRate !== undefined && heartRate > band.heartRateThreshold) {
    triggers.push(`Tachycardia: ${heartRate} bpm > ${band.heartRateThreshold} for ${band.label}`);
    sirsScore++;
  }

  if (o2Saturation !== undefined && o2Saturation < band.o2SatThreshold) {
    triggers.push(`Hypoxia: SpO₂ ${o2Saturation}% < ${band.o2SatThreshold}% for ${band.label}`);
    sirsScore += 2; // Hypoxia counts double in SIRS screening
  }

  const isHighRisk = sirsScore >= band.sirsMinCriteria || triggers.length > 0;

  return {
    isHighRisk,
    disposition: isHighRisk ? band.hardStopDisposition : undefined,
    triggers,
    band,
    sirsScore,
    requiresWeightCheck: band.requiresWeightForDosing && params.weightKg === undefined,
  };
}
