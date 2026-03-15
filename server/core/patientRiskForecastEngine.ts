import type { PatientProfile } from '../../shared/clinicalEngineTypes';

export interface RiskForecast {
  deteriorationRisk: 'high' | 'moderate' | 'low';
  deteriorationScore: number;
  earlyWarningScore: number;
  recommendedMonitoring: string[];
  redFlags: string[];
  timeToReviewHours: number;
}

export function runPatientRiskForecastEngine(
  symptoms: string[],
  vitals: Record<string, number>,
  profile: PatientProfile,
  severity: number
): RiskForecast {
  let ews = 0;
  const redFlags: string[] = [];
  const recommendedMonitoring: string[] = [];

  // ── Modified Early Warning Score (MEWS) ──────────────────────────────────
  if (vitals.systolicBP !== undefined) {
    if (vitals.systolicBP < 70) ews += 3;
    else if (vitals.systolicBP < 80) ews += 2;
    else if (vitals.systolicBP < 100) ews += 1;
    else if (vitals.systolicBP >= 200) ews += 2;
  }
  if (vitals.heartRate !== undefined) {
    if (vitals.heartRate < 40 || vitals.heartRate > 130) ews += 3;
    else if (vitals.heartRate < 50 || vitals.heartRate > 100) ews += 1;
  }
  if (vitals.respiratoryRate !== undefined) {
    if (vitals.respiratoryRate < 9 || vitals.respiratoryRate > 29) ews += 2;
    else if (vitals.respiratoryRate > 20) ews += 1;
  }
  if (vitals.temperatureC !== undefined) {
    if (vitals.temperatureC < 35 || vitals.temperatureC > 38.9) ews += 2;
    else if (vitals.temperatureC > 37.5) ews += 1;
  }
  if (vitals.spo2 !== undefined) {
    if (vitals.spo2 < 90) { ews += 3; redFlags.push('SpO2 < 90% — immediate oxygen'); }
    else if (vitals.spo2 < 94) { ews += 1; redFlags.push('SpO2 < 94%'); }
  }

  // ── Symptom risk flags ────────────────────────────────────────────────────
  if (symptoms.includes('altered_consciousness')) { ews += 3; redFlags.push('Altered mental status'); }
  if (symptoms.includes('diaphoresis') && symptoms.includes('chest_pain')) redFlags.push('Diaphoresis + chest pain — ACS concern');
  if (symptoms.includes('stiff_neck') && symptoms.includes('fever')) redFlags.push('Meningism triad present');

  // ── Profile modifiers ─────────────────────────────────────────────────────
  let deteriorationScore = ews / 10;
  if ((profile.age ?? 0) >= 75) deteriorationScore += 0.1;
  if ((profile.comorbidities ?? []).includes('immunocompromised')) deteriorationScore += 0.1;
  if (severity >= 6) deteriorationScore += 0.15;
  deteriorationScore = Math.min(Math.max(deteriorationScore, 0), 1);

  const deteriorationRisk: 'high' | 'moderate' | 'low' =
    deteriorationScore >= 0.5 ? 'high'
    : deteriorationScore >= 0.25 ? 'moderate'
    : 'low';

  // ── Monitoring recommendations ────────────────────────────────────────────
  if (deteriorationRisk === 'high') {
    recommendedMonitoring.push('Continuous SpO2 monitoring', 'Vital signs q15min', 'IV access', 'Physician at bedside');
  } else if (deteriorationRisk === 'moderate') {
    recommendedMonitoring.push('Vital signs q30min', 'Reassess in 1 hour');
  } else {
    recommendedMonitoring.push('Routine vital signs', 'Standard follow-up');
  }

  const timeToReviewHours = deteriorationRisk === 'high' ? 0.5 : deteriorationRisk === 'moderate' ? 2 : 24;

  return { deteriorationRisk, deteriorationScore: Math.round(deteriorationScore * 100) / 100, earlyWarningScore: ews, recommendedMonitoring, redFlags, timeToReviewHours };
}
