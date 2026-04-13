/**
 * Predictive ICU Risk Engine
 * Computes multi-dimensional risk scores for deterioration, sepsis, shock,
 * and respiratory failure from vitals and lab data.
 * Modeled after NEWS2 + lactate-based early warning logic.
 */

export interface PatientState {
  id: string;
  vitals: {
    hr: number;
    rr: number;
    spo2: number;
    temp: number;
    sbp: number;
  };
  labs?: {
    lactate?: number;
    wbc?: number;
    creatinine?: number;
    bilirubin?: number;
  };
  symptoms: string[];
}

export interface RiskPrediction {
  sepsisRisk: number;
  shockRisk: number;
  respiratoryFailureRisk: number;
  deteriorationScore: number;
  riskLabel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  triggeringFactors: string[];
}

export function computeRisk(p: PatientState): RiskPrediction {
  let sepsis = 0;
  let shock = 0;
  let resp = 0;
  const factors: string[] = [];

  // ── Sepsis scoring (NEWS2 + lactate-inspired) ────────────────────────────
  if (p.vitals.temp > 38.3) { sepsis += 0.2; factors.push("fever"); }
  else if (p.vitals.temp < 36) { sepsis += 0.15; factors.push("hypothermia"); }
  if (p.vitals.hr > 110) { sepsis += 0.2; factors.push("tachycardia"); }
  if (p.vitals.rr > 22) { sepsis += 0.2; factors.push("tachypnea"); }
  if (p.labs?.lactate && p.labs.lactate > 2) { sepsis += 0.25; factors.push(`lactate_${p.labs.lactate}`); }
  if (p.labs?.wbc && (p.labs.wbc > 12 || p.labs.wbc < 4)) { sepsis += 0.1; factors.push("wbc_abnormal"); }

  // ── Shock scoring ─────────────────────────────────────────────────────────
  if (p.vitals.sbp < 90) { shock += 0.5; factors.push("hypotension"); }
  else if (p.vitals.sbp < 100) { shock += 0.2; factors.push("borderline_sbp"); }
  if (p.labs?.lactate && p.labs.lactate > 4) { shock += 0.5; factors.push("high_lactate"); }
  if (p.vitals.hr > 130) { shock += 0.15; factors.push("severe_tachycardia"); }

  // ── Respiratory failure scoring ───────────────────────────────────────────
  if (p.vitals.spo2 < 88) { resp += 0.5; factors.push("severe_hypoxia"); }
  else if (p.vitals.spo2 < 92) { resp += 0.3; factors.push("hypoxia"); }
  if (p.vitals.rr > 30) { resp += 0.4; factors.push("severe_tachypnea"); }
  else if (p.vitals.rr > 25) { resp += 0.2; factors.push("mod_tachypnea"); }
  if (p.symptoms.some(s => ["shortness of breath", "sob", "dyspnea"].includes(s.toLowerCase()))) {
    resp += 0.1; factors.push("dyspnea_reported");
  }

  const deterioration = Math.min(1, sepsis * 0.35 + shock * 0.40 + resp * 0.25);
  const sepsisRisk = Math.min(1, sepsis);
  const shockRisk = Math.min(1, shock);
  const respiratoryFailureRisk = Math.min(1, resp);

  let riskLabel: RiskPrediction["riskLabel"] = "LOW";
  if (deterioration >= 0.75) riskLabel = "CRITICAL";
  else if (deterioration >= 0.5) riskLabel = "HIGH";
  else if (deterioration >= 0.25) riskLabel = "MODERATE";

  return {
    sepsisRisk,
    shockRisk,
    respiratoryFailureRisk,
    deteriorationScore: deterioration,
    riskLabel,
    triggeringFactors: [...new Set(factors)],
  };
}
