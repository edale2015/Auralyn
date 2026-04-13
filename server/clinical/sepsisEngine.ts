/**
 * sepsisEngine.ts — Simplified NEWS2 + qSOFA for simulation/eval pipeline
 *
 * Article 28b (Command Center): "sepsisEngine.ts — calculateNEWS2, calculateQSOFA,
 *  detectSepsis. Simplified 5-param NEWS2 for fast evaluation across 1000+ patients."
 *
 * NOTE: This is a simulation-tuned engine distinct from server/clinical/sepsis.ts
 *  (the full 7-param clinical engine). This engine prioritizes throughput for
 *  the validation harness and multi-patient simulator.
 *
 * Article 28b parameters:
 *   NEWS2:  RR > 25 (+3), SpO2 < 92 (+3), Temp > 38.5 (+2), SBP < 90 (+3), HR > 130 (+3)
 *   qSOFA:  RR >= 22 (+1), SBP <= 100 (+1), altered mental status (+1)
 *   Sepsis risk = NEWS2 > 5 OR qSOFA >= 2 OR lactate > 2
 *
 * Clinical threshold table:
 *   NEWS2 0-4:  Routine monitoring
 *   NEWS2 5-6:  Urgent clinical review
 *   NEWS2 7+:   Emergency response / critical care
 */

import type { PatientVitals, PatientLabs } from "../simulation/patientGenerator";

// ── NEWS2 (simplified 5-param version for simulation) ─────────────────────────

export interface NEWS2Result {
  score:     number;
  breakdown: {
    rr:    number;
    spo2:  number;
    temp:  number;
    sbp:   number;
    hr:    number;
  };
  level:     "routine" | "urgent" | "emergency";
}

export function calculateNEWS2(vitals: PatientVitals): NEWS2Result {
  const rr   = vitals.rr   > 25 ? 3 : 0;
  const spo2 = vitals.spo2 < 92 ? 3 : 0;
  const temp = vitals.temp > 38.5 ? 2 : 0;
  const sbp  = vitals.sbp  < 90  ? 3 : 0;
  const hr   = vitals.hr   > 130 ? 3 : 0;
  const score = rr + spo2 + temp + sbp + hr;

  return {
    score,
    breakdown: { rr, spo2, temp, sbp, hr },
    level: score >= 7 ? "emergency" : score >= 5 ? "urgent" : "routine",
  };
}

// ── qSOFA ─────────────────────────────────────────────────────────────────────

export interface QSOFAResult {
  score:     number;
  breakdown: {
    rr:            number;
    sbp:           number;
    mentalStatus:  number;
  };
  highRisk:  boolean;   // qSOFA >= 2
}

export function calculateQSOFA(
  vitals:       PatientVitals,
  mentalStatus: "normal" | "altered" = "normal",
): QSOFAResult {
  const rr   = vitals.rr  >= 22  ? 1 : 0;
  const sbp  = vitals.sbp <= 100 ? 1 : 0;
  const ms   = mentalStatus === "altered" ? 1 : 0;
  const score = rr + sbp + ms;

  return {
    score,
    breakdown: { rr, sbp, mentalStatus: ms },
    highRisk:  score >= 2,
  };
}

// ── detectSepsis ──────────────────────────────────────────────────────────────

export interface SepsisDetectionResult {
  sepsisRisk:  boolean;
  news2:       number;
  qsofa:       number;
  lactateHigh: boolean;
  triggers:    string[];    // which criteria fired
  urgency:     "none" | "monitor" | "urgent" | "critical";
}

export function detectSepsis(
  vitals:       PatientVitals,
  labs:         PatientLabs,
  mentalStatus: "normal" | "altered" = "normal",
): SepsisDetectionResult {
  const news2Result  = calculateNEWS2(vitals);
  const qsofaResult  = calculateQSOFA(vitals, mentalStatus);
  const lactateHigh  = labs.lactate > 2;

  const triggers: string[] = [];
  if (news2Result.score > 5)    triggers.push(`NEWS2 ${news2Result.score} > 5`);
  if (qsofaResult.highRisk)     triggers.push(`qSOFA ${qsofaResult.score} ≥ 2`);
  if (lactateHigh)              triggers.push(`Lactate ${labs.lactate} > 2 mmol/L`);

  const sepsisRisk = triggers.length > 0;

  const urgency =
    news2Result.score >= 7 ? "critical"
    : news2Result.score >= 5 || qsofaResult.highRisk ? "urgent"
    : sepsisRisk ? "monitor"
    : "none";

  return {
    sepsisRisk,
    news2:   news2Result.score,
    qsofa:   qsofaResult.score,
    lactateHigh,
    triggers,
    urgency,
  };
}
