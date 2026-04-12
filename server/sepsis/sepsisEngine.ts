/**
 * Predictive Sepsis Engine — early sepsis detection BEFORE overt instability
 * Combines NEWS2 + qSOFA + infection signals + lactate
 * Probability 0–1; highRisk ≥ 0.6 triggers SEPSIS_ALERT
 */

import { computeNEWS2 }       from "../engines/interventionEngine";
import { calculateQSOFA }      from "../triage/scopeAwareTriageEngine";

export interface SepsisInput {
  id:          string;
  vitals: {
    hr:         number;
    spo2:       number;
    temp:       number;       // °F
    systolicBP: number;
    rr?:        number;
    alteredMentalStatus?: boolean;
  };
  symptoms?:   string[];
  labs?:       { lactate?: number; wbc?: number; [k: string]: any };
  trend?:      { hrTrend?: number; spo2Trend?: number };
}

export interface SepsisResult {
  probability:  number;       // 0–1
  highRisk:     boolean;
  trigger:      "SEPSIS_ALERT" | null;
  factors:      string[];     // human-readable contributing factors
  news2:        number;
  qsofa:        number;
}

export function detectSepsisRisk(patient: SepsisInput): SepsisResult {
  const vitals   = patient.vitals;
  const symptoms = patient.symptoms ?? [];
  const labs     = patient.labs ?? {};
  const trend    = patient.trend ?? {};

  const news2  = computeNEWS2({
    hr: vitals.hr, spo2: vitals.spo2, temp: vitals.temp,
    systolicBP: vitals.systolicBP, rr: vitals.rr,
  });
  const qsofa  = calculateQSOFA({
    hr: vitals.hr, spo2: vitals.spo2, temp: vitals.temp,
    systolicBP: vitals.systolicBP, rr: vitals.rr,
    alteredMentalStatus: vitals.alteredMentalStatus,
  });

  const infectionSignals =
    symptoms.includes("fever") ||
    symptoms.includes("chills") ||
    symptoms.includes("infection") ||
    (vitals.temp > 101.5);

  const factors: string[] = [];
  let probability = 0;

  probability += news2 * 0.08;
  if (news2 > 5)      factors.push(`NEWS2 ${news2} (high)`);

  probability += qsofa * 0.15;
  if (qsofa >= 2)     factors.push(`qSOFA ${qsofa} (≥2 = sepsis-likely)`);

  if (infectionSignals) {
    probability += 0.2;
    factors.push("Infection signals (fever/chills)");
  }

  if ((labs.lactate ?? 0) > 2) {
    probability += 0.3;
    factors.push(`Elevated lactate ${labs.lactate} mmol/L`);
  }

  if ((labs.lactate ?? 0) > 4) {
    probability += 0.2;
    factors.push("Severe hyperlactatemia (>4) — septic shock risk");
  }

  if ((labs.wbc ?? 0) > 12 || (labs.wbc ?? 0) < 4) {
    probability += 0.1;
    factors.push(`Abnormal WBC ${labs.wbc}`);
  }

  if ((trend.hrTrend ?? 0) > 10) {
    probability += 0.05;
    factors.push("Rising HR trend");
  }

  if ((trend.spo2Trend ?? 0) < -3) {
    probability += 0.05;
    factors.push("Falling SpO2 trend");
  }

  probability = Math.min(probability, 1);
  const highRisk = probability > 0.6;

  return {
    probability: Math.round(probability * 1000) / 1000,
    highRisk,
    trigger: highRisk ? "SEPSIS_ALERT" : null,
    factors,
    news2,
    qsofa,
  };
}
