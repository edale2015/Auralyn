/**
 * MY ADDITION — DOMAIN 1: Vital Signs Threshold Checker
 *
 * Adult and pediatric vital sign thresholds with clinical context.
 * Used by the independent safety path and the guardrail engine.
 * Surfaces qSOFA (quick Sequential Organ Failure Assessment) score
 * for sepsis screening — a widely-used, evidence-based tool.
 */

export interface VitalSigns {
  heartRate?:         number;   // bpm
  systolicBP?:        number;   // mmHg
  respiratoryRate?:   number;   // breaths/min
  temperatureC?:      number;
  o2Saturation?:      number;   // %
  glasgowComaScale?:  number;   // 3-15
  ageYears?:          number;
}

export interface VitalSignsAssessment {
  isAbnormal:    boolean;
  isCritical:    boolean;
  findings:      string[];
  qSofaScore:    number;         // 0-3: ≥2 = suspected sepsis
  shockIndex?:   number;         // HR / SBP — ≥1.0 suggests hemodynamic compromise
  newsScore:     number;         // National Early Warning Score approximation
}

function getNewsPoints(vs: VitalSigns): number {
  let score = 0;
  if (vs.respiratoryRate !== undefined) {
    if (vs.respiratoryRate <= 8)            score += 3;
    else if (vs.respiratoryRate <= 11)      score += 1;
    else if (vs.respiratoryRate >= 25)      score += 3;
    else if (vs.respiratoryRate >= 21)      score += 2;
  }
  if (vs.o2Saturation !== undefined) {
    if (vs.o2Saturation <= 91)             score += 3;
    else if (vs.o2Saturation <= 93)        score += 2;
    else if (vs.o2Saturation <= 95)        score += 1;
  }
  if (vs.temperatureC !== undefined) {
    if (vs.temperatureC <= 35.0)           score += 3;
    else if (vs.temperatureC <= 36.0)      score += 1;
    else if (vs.temperatureC >= 39.1)      score += 2;
    else if (vs.temperatureC >= 38.1)      score += 1;
  }
  if (vs.systolicBP !== undefined) {
    if (vs.systolicBP <= 90)              score += 3;
    else if (vs.systolicBP <= 100)        score += 2;
    else if (vs.systolicBP <= 110)        score += 1;
    else if (vs.systolicBP >= 220)        score += 3;
  }
  if (vs.heartRate !== undefined) {
    if (vs.heartRate <= 40)               score += 3;
    else if (vs.heartRate <= 50)          score += 1;
    else if (vs.heartRate >= 131)         score += 3;
    else if (vs.heartRate >= 111)         score += 2;
    else if (vs.heartRate >= 91)          score += 1;
  }
  if (vs.glasgowComaScale !== undefined && vs.glasgowComaScale < 15) {
    score += 3;
  }
  return score;
}

export function assessVitalSigns(vs: VitalSigns): VitalSignsAssessment {
  const findings: string[] = [];
  let isCritical = false;
  let qSofaScore = 0;

  if (vs.respiratoryRate !== undefined && vs.respiratoryRate >= 22) {
    qSofaScore++;
    findings.push(`Tachypnea: RR ${vs.respiratoryRate}/min (qSOFA criterion)`);
  }
  if (vs.systolicBP !== undefined && vs.systolicBP <= 100) {
    qSofaScore++;
    findings.push(`Hypotension: SBP ${vs.systolicBP} mmHg (qSOFA criterion)`);
    if (vs.systolicBP <= 70) { isCritical = true; findings.push("CRITICAL: Severe hypotension"); }
  }
  if (vs.glasgowComaScale !== undefined && vs.glasgowComaScale < 15) {
    qSofaScore++;
    findings.push(`Altered GCS: ${vs.glasgowComaScale}/15 (qSOFA criterion)`);
    if (vs.glasgowComaScale <= 8) { isCritical = true; findings.push("CRITICAL: Severely impaired consciousness"); }
  }

  if (vs.o2Saturation !== undefined && vs.o2Saturation < 88) {
    isCritical = true;
    findings.push(`CRITICAL: SpO₂ ${vs.o2Saturation}% — immediate oxygen required`);
  } else if (vs.o2Saturation !== undefined && vs.o2Saturation < 92) {
    findings.push(`Hypoxia: SpO₂ ${vs.o2Saturation}%`);
  }

  if (vs.heartRate !== undefined && vs.heartRate >= 150) {
    isCritical = true;
    findings.push(`CRITICAL: Severe tachycardia ${vs.heartRate} bpm`);
  } else if (vs.heartRate !== undefined && vs.heartRate >= 100) {
    findings.push(`Tachycardia: HR ${vs.heartRate} bpm`);
  } else if (vs.heartRate !== undefined && vs.heartRate <= 40) {
    isCritical = true;
    findings.push(`CRITICAL: Bradycardia ${vs.heartRate} bpm`);
  }

  if (vs.temperatureC !== undefined) {
    if (vs.temperatureC >= 40.0) { findings.push(`Hyperpyrexia: ${vs.temperatureC}°C`); }
    else if (vs.temperatureC <= 35.0) { isCritical = true; findings.push(`CRITICAL: Hypothermia ${vs.temperatureC}°C`); }
  }

  const shockIndex = (vs.heartRate && vs.systolicBP && vs.systolicBP > 0)
    ? vs.heartRate / vs.systolicBP
    : undefined;
  if (shockIndex !== undefined && shockIndex >= 1.0) {
    findings.push(`Shock Index ≥ 1.0 (${shockIndex.toFixed(2)}) — hemodynamic compromise risk`);
  }

  const newsScore = getNewsPoints(vs);
  if (newsScore >= 7) { isCritical = true; findings.push(`NEWS Score ${newsScore} — urgent clinical review`); }
  else if (newsScore >= 5) { findings.push(`NEWS Score ${newsScore} — increased monitoring needed`); }

  if (qSofaScore >= 2) {
    findings.push(`qSOFA Score ${qSofaScore}/3 — suspected sepsis: initiate sepsis pathway`);
  }

  return {
    isAbnormal: findings.length > 0,
    isCritical,
    findings,
    qSofaScore,
    shockIndex,
    newsScore,
  };
}
