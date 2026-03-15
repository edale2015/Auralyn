import type { DifferentialScore, PatientProfile } from '../../shared/clinicalEngineTypes';

export interface OutcomePrediction {
  hospitalizationRisk: number;
  icu_risk: number;
  returnVisitRisk: number;
  confidence: 'high' | 'moderate' | 'low';
  riskFactors: string[];
  protectiveFactors: string[];
}

const HIGH_RISK_DIAGNOSES = new Set([
  'acute_coronary_syndrome', 'pulmonary_embolism', 'meningitis',
  'sepsis', 'stroke', 'aortic_dissection', 'subarachnoid_hemorrhage',
  'pyelonephritis', 'pneumonia', 'myocardial_infarction',
]);

export function runOutcomePredictionEngine(
  topDifferentials: DifferentialScore[],
  profile: PatientProfile,
  severity: number,
  disposition: string
): OutcomePrediction {
  const riskFactors: string[] = [];
  const protectiveFactors: string[] = [];
  let hospScore = 0;
  let icuScore = 0;
  let returnScore = 0;

  // ── Diagnosis risk ────────────────────────────────────────────────────────
  const topDx = topDifferentials[0];
  if (topDx && HIGH_RISK_DIAGNOSES.has(topDx.diagnosis)) {
    hospScore += 0.4;
    riskFactors.push(`High-acuity diagnosis: ${topDx.diagnosis}`);
  }

  // ── Severity score ────────────────────────────────────────────────────────
  if (severity >= 6) { hospScore += 0.35; icuScore += 0.3; riskFactors.push('High severity score'); }
  else if (severity >= 3) { hospScore += 0.15; riskFactors.push('Moderate severity'); }
  else protectiveFactors.push('Low severity score');

  // ── Age ───────────────────────────────────────────────────────────────────
  if ((profile.age ?? 0) >= 65) { hospScore += 0.15; icuScore += 0.1; riskFactors.push('Age ≥65'); }
  else if ((profile.age ?? 0) <= 2) { hospScore += 0.1; riskFactors.push('Infant/toddler'); }
  else protectiveFactors.push('Working-age adult');

  // ── Comorbidities ─────────────────────────────────────────────────────────
  const comorbidities = profile.comorbidities ?? [];
  if (comorbidities.includes('diabetes')) { hospScore += 0.1; riskFactors.push('Diabetes'); }
  if (comorbidities.includes('COPD') || comorbidities.includes('asthma')) { hospScore += 0.1; icuScore += 0.05; riskFactors.push('Pulmonary comorbidity'); }
  if (comorbidities.includes('heart_failure') || comorbidities.includes('CAD')) { hospScore += 0.15; icuScore += 0.1; riskFactors.push('Cardiac comorbidity'); }
  if (comorbidities.includes('immunocompromised')) { hospScore += 0.2; riskFactors.push('Immunocompromised'); }
  if (comorbidities.length === 0) protectiveFactors.push('No known comorbidities');

  // ── Disposition ───────────────────────────────────────────────────────────
  if (disposition === 'HOME_CARE') { returnScore += 0.1; protectiveFactors.push('Safe for home care'); }
  if (disposition === 'VIDEO_VISIT') returnScore += 0.15;
  if (disposition === 'ER_NOW') { hospScore = Math.min(hospScore + 0.3, 0.95); }

  // ── Clamp scores ──────────────────────────────────────────────────────────
  hospScore = Math.min(Math.max(hospScore, 0.01), 0.95);
  icuScore = Math.min(Math.max(icuScore, 0), 0.8);
  returnScore = Math.min(Math.max(returnScore, 0.05), 0.75);

  const confidence: 'high' | 'moderate' | 'low' =
    (topDx?.score ?? 0) > 0.7 && riskFactors.length >= 2 ? 'high'
    : riskFactors.length >= 1 ? 'moderate'
    : 'low';

  return {
    hospitalizationRisk: Math.round(hospScore * 100) / 100,
    icu_risk: Math.round(icuScore * 100) / 100,
    returnVisitRisk: Math.round(returnScore * 100) / 100,
    confidence,
    riskFactors,
    protectiveFactors,
  };
}
