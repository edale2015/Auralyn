/**
 * DOMAIN 1: Vital Signs Threshold Checker
 *
 * Adult and pediatric vital sign thresholds with clinical context.
 * Used by the independent safety path and the guardrail engine.
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - PEWS (Pediatric Early Warning Score) — for pediatric case escalation
 *   - CURB-65 — community-acquired pneumonia severity (critical for Flu pack)
 *   - Phoenix Score for pediatric sepsis (Lancet 2024 — replaces SIRS)
 */

export interface VitalSigns {
  heartRate?:         number;   // bpm
  systolicBP?:        number;   // mmHg
  diastolicBP?:       number;   // mmHg
  respiratoryRate?:   number;   // breaths/min
  temperatureC?:      number;
  o2Saturation?:      number;   // %
  glasgowComaScale?:  number;   // 3–15
  ageYears?:          number;
}

export interface VitalSignsAssessment {
  isAbnormal:   boolean;
  isCritical:   boolean;
  findings:     string[];
  qSofaScore:   number;     // 0–3: ≥2 = suspected sepsis
  shockIndex?:  number;     // HR / SBP — ≥1.0 = hemodynamic compromise risk
  newsScore:    number;     // National Early Warning Score approximation
}

// ─── PEWS (Pediatric Early Warning Score) ────────────────────────────────────

export interface PEWSInput {
  behaviorScore:       number;   // 0–3: playing=0, sleeping=1, irritable=2, lethargic/confused=3
  cardiovascularScore: number;   // 0–3: normal=0, tachycardia=1, severe tachycardia+cap refill=2, bradycardia/low BP=3
  respiratoryScore:    number;   // 0–3: normal=0, >10 above normal+accessory=1, >20 above=2, ≥5 below+retractions=3
}

export interface PEWSScore {
  behaviorScore:       number;
  cardiovascularScore: number;
  respiratoryScore:    number;
  totalScore:          number;
  isEscalationNeeded:  boolean;   // PEWS ≥ 4 = urgent escalation
  isCritical:          boolean;   // PEWS ≥ 6 = immediate escalation
  interpretation:      string;
}

export function computePEWS(input: PEWSInput): PEWSScore {
  const total = input.behaviorScore + input.cardiovascularScore + input.respiratoryScore;
  return {
    behaviorScore:       input.behaviorScore,
    cardiovascularScore: input.cardiovascularScore,
    respiratoryScore:    input.respiratoryScore,
    totalScore:          total,
    isEscalationNeeded:  total >= 4,
    isCritical:          total >= 6,
    interpretation:
      total >= 6 ? `PEWS ${total} — Immediate escalation required` :
      total >= 4 ? `PEWS ${total} — Urgent escalation recommended` :
      total >= 2 ? `PEWS ${total} — Increased monitoring needed` :
                   `PEWS ${total} — Within expected range`,
  };
}


// ─── CURB-65 (Community-Acquired Pneumonia Severity) ─────────────────────────

export interface CURB65Input {
  confusion:       boolean;   // new-onset confusion
  uremiaBUN_gt19:  boolean;   // BUN > 19 mg/dL (or > 7 mmol/L)
  respiratoryRate: boolean;   // RR ≥ 30/min
  lowBP:           boolean;   // SBP < 90 or DBP ≤ 60 mmHg
  age65OrOver:     boolean;   // age ≥ 65
}

export interface CURB65Score {
  confusion:        boolean;
  uremiaBUN_gt19:   boolean;
  respiratoryRate:  boolean;
  lowBP:            boolean;
  age65OrOver:      boolean;
  score:            number;   // 0–5
  recommendedCare:  "home" | "consider_hospital" | "hospital" | "icu";
  interpretation:   string;
  mortality30Day:   string;   // estimated 30-day mortality band
}

export function computeCURB65(input: CURB65Input): CURB65Score {
  const score =
    (input.confusion       ? 1 : 0) +
    (input.uremiaBUN_gt19  ? 1 : 0) +
    (input.respiratoryRate ? 1 : 0) +
    (input.lowBP           ? 1 : 0) +
    (input.age65OrOver     ? 1 : 0);

  const recommendedCare: CURB65Score["recommendedCare"] =
    score <= 1 ? "home" :
    score === 2 ? "consider_hospital" :
    score === 3 ? "hospital" :
    "icu";

  const mortality30Day =
    score === 0 ? "< 1%" :
    score === 1 ? "2.7%" :
    score === 2 ? "9.2%" :
    score === 3 ? "14.5%" :
    score === 4 ? "40%" :
    "> 57%";

  const interpretations: Record<string, string> = {
    home:              `CURB-65 ${score} — Low severity: home treatment appropriate`,
    consider_hospital: `CURB-65 ${score} — Moderate severity: consider hospital observation`,
    hospital:          `CURB-65 ${score} — Moderate-severe: hospital admission recommended`,
    icu:               `CURB-65 ${score} — Severe: consider ICU or intensive monitoring`,
  };

  return {
    ...input,
    score,
    recommendedCare,
    interpretation: interpretations[recommendedCare],
    mortality30Day,
  };
}


// ─── Phoenix Pediatric Sepsis Score (Lancet 2024) ────────────────────────────

export interface PhoenixSepsisInput {
  respiratoryScore:    number;   // 0–3: based on SpO2/FiO2 ratio and respiratory support
  cardiovascularScore: number;   // 0–6: vasoactive drugs, lactate, MAP for age
  coagulationScore:    number;   // 0–2: platelets, INR, D-dimer, fibrinogen
  neurologicalScore:   number;   // 0–2: GCS < 11 or pupil abnormality
}

export interface PhoenixSepsisScore {
  respiratoryScore:    number;
  cardiovascularScore: number;
  coagulationScore:    number;
  neurologicalScore:   number;
  totalPhoenixScore:   number;
  sepsisMeetsCriteria: boolean;   // Phoenix score ≥ 2 = pediatric sepsis (Lancet 2024)
  septicShock:         boolean;   // cardiovascular score ≥ 1 AND total ≥ 2
  interpretation:      string;
}

export function computePhoenixScore(input: PhoenixSepsisInput): PhoenixSepsisScore {
  const total = input.respiratoryScore + input.cardiovascularScore +
                input.coagulationScore + input.neurologicalScore;
  const meets = total >= 2;
  const shock  = input.cardiovascularScore >= 1 && meets;

  return {
    ...input,
    totalPhoenixScore:   total,
    sepsisMeetsCriteria: meets,
    septicShock:         shock,
    interpretation:
      shock  ? `Phoenix Score ${total} — Pediatric Septic Shock: immediate resuscitation` :
      meets  ? `Phoenix Score ${total} — Pediatric Sepsis criteria met (Lancet 2024): urgent evaluation` :
               `Phoenix Score ${total} — Does not meet pediatric sepsis criteria`,
  };
}


// ─── NEWS (National Early Warning Score) ─────────────────────────────────────

function getNewsPoints(vs: VitalSigns): number {
  let score = 0;
  if (vs.respiratoryRate !== undefined) {
    if (vs.respiratoryRate <= 8)       score += 3;
    else if (vs.respiratoryRate <= 11) score += 1;
    else if (vs.respiratoryRate >= 25) score += 3;
    else if (vs.respiratoryRate >= 21) score += 2;
  }
  if (vs.o2Saturation !== undefined) {
    if (vs.o2Saturation <= 91)        score += 3;
    else if (vs.o2Saturation <= 93)   score += 2;
    else if (vs.o2Saturation <= 95)   score += 1;
  }
  if (vs.temperatureC !== undefined) {
    if (vs.temperatureC <= 35.0)      score += 3;
    else if (vs.temperatureC <= 36.0) score += 1;
    else if (vs.temperatureC >= 39.1) score += 2;
    else if (vs.temperatureC >= 38.1) score += 1;
  }
  if (vs.systolicBP !== undefined) {
    if (vs.systolicBP <= 90)          score += 3;
    else if (vs.systolicBP <= 100)    score += 2;
    else if (vs.systolicBP <= 110)    score += 1;
    else if (vs.systolicBP >= 220)    score += 3;
  }
  if (vs.heartRate !== undefined) {
    if (vs.heartRate <= 40)           score += 3;
    else if (vs.heartRate <= 50)      score += 1;
    else if (vs.heartRate >= 131)     score += 3;
    else if (vs.heartRate >= 111)     score += 2;
    else if (vs.heartRate >= 91)      score += 1;
  }
  if (vs.glasgowComaScale !== undefined && vs.glasgowComaScale < 15) score += 3;
  return score;
}


// ─── Full Vital Signs Assessment ──────────────────────────────────────────────

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
    ? vs.heartRate / vs.systolicBP : undefined;
  if (shockIndex !== undefined && shockIndex >= 1.0) {
    findings.push(`Shock Index ≥ 1.0 (${shockIndex.toFixed(2)}) — hemodynamic compromise risk`);
  }

  const newsScore = getNewsPoints(vs);
  if (newsScore >= 7) { isCritical = true; findings.push(`NEWS Score ${newsScore} — urgent clinical review`); }
  else if (newsScore >= 5) { findings.push(`NEWS Score ${newsScore} — increased monitoring needed`); }

  if (qSofaScore >= 2) findings.push(`qSOFA Score ${qSofaScore}/3 — suspected sepsis: initiate sepsis pathway`);

  return { isAbnormal: findings.length > 0, isCritical, findings, qSofaScore, shockIndex, newsScore };
}
