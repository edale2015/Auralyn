/**
 * icuPredictor.ts — NEWS2 + Lactate ICU Risk Predictor
 *
 * Deterministic, auditable scoring model based on:
 *   - NEWS2 (National Early Warning Score 2): RR, SpO2, temp, SBP, HR, mental status, O2 support
 *   - Lactate: tissue hypoperfusion indicator
 *   - Age modifier: ≥75 years adds 1 point
 *
 * All predictions are persisted to the icuPredictions table and audited.
 * This module makes RECOMMENDATIONS ONLY — no autonomous clinical actions.
 * Every result has requiresPhysicianReview: true.
 */

import { desc }             from "drizzle-orm";
import { db }               from "../db";
import { icuPredictions, patientSnapshots } from "../../shared/schema";
import { auditStep }        from "../audit/auditLogger";

export interface PredictorVitals {
  rr?:            number;
  spo2?:          number;
  tempC?:         number;
  systolicBP?:    number;
  hr?:            number;
  mentalStatus?:  "alert" | "voice" | "pain" | "unresponsive" | "confused";
  supplementalO2?:boolean;
}

export interface PredictorLabs {
  lactate?:    number;
  wbc?:        number;
  creatinine?: number;
}

export interface PredictorInput {
  patientId: string;
  clinicId?: string;
  complaint?:string;
  ageYears?: number;
  vitals:    PredictorVitals;
  labs?:     PredictorLabs;
}

export interface PredictorResult {
  patientId:        string;
  riskScore:        number;
  riskBand:         "low" | "moderate" | "high" | "critical";
  recommendedLevel: "floor" | "monitored" | "stepdown" | "icu";
  explanation:      Array<{ factor: string; value: number | string; impact: number; note: string }>;
  features:         Record<string, unknown>;
}

// ── NEWS2 scoring functions ───────────────────────────────────────────────────

function scoreRR(rr?: number): number {
  if (rr == null) return 0;
  if (rr <= 8 || rr >= 25) return 3;
  if (rr >= 21)             return 2;
  if (rr >= 9 && rr <= 11) return 1;
  return 0;
}

function scoreSpo2(spo2?: number): number {
  if (spo2 == null) return 0;
  if (spo2 <= 91)   return 3;
  if (spo2 <= 93)   return 2;
  if (spo2 <= 95)   return 1;
  return 0;
}

function scoreTemp(tempC?: number): number {
  if (tempC == null)          return 0;
  if (tempC <= 35)             return 3;
  if (tempC >= 39.1)           return 2;
  if (tempC >= 38.1)           return 1;
  if (tempC >= 35.1 && tempC <= 36) return 1;
  return 0;
}

function scoreSBP(sbp?: number): number {
  if (sbp == null)             return 0;
  if (sbp <= 90)               return 3;
  if (sbp <= 100)              return 2;
  if (sbp >= 220)              return 3;
  if (sbp >= 101 && sbp <= 110) return 1;
  return 0;
}

function scoreHR(hr?: number): number {
  if (hr == null)             return 0;
  if (hr <= 40 || hr >= 131)  return 3;
  if (hr >= 111)              return 2;
  if (hr >= 91)               return 1;
  if (hr >= 41 && hr <= 50)  return 1;
  return 0;
}

function scoreMentalStatus(ms?: PredictorVitals["mentalStatus"]): number {
  return (!ms || ms === "alert") ? 0 : 3;
}

function scoreO2Support(flag?: boolean): number {
  return flag ? 2 : 0;
}

function scoreLactate(lactate?: number): number {
  if (lactate == null) return 0;
  if (lactate >= 4)   return 4;
  if (lactate >= 2)   return 2;
  return 0;
}

function toBand(score: number): PredictorResult["riskBand"] {
  if (score >= 13) return "critical";
  if (score >= 9)  return "high";
  if (score >= 5)  return "moderate";
  return "low";
}

function toLevel(score: number): PredictorResult["recommendedLevel"] {
  if (score >= 13) return "icu";
  if (score >= 9)  return "stepdown";
  if (score >= 5)  return "monitored";
  return "floor";
}

// ── Pure scoring function (synchronous, no I/O) ───────────────────────────────

export function calculateIcuRisk(input: PredictorInput): PredictorResult {
  const explanation: PredictorResult["explanation"] = [];

  const push = (factor: string, value: number | string, impact: number, note: string) => {
    if (impact > 0) explanation.push({ factor, value, impact, note });
  };

  const rrScore   = scoreRR(input.vitals.rr);
  const spo2Score = scoreSpo2(input.vitals.spo2);
  const tempScore = scoreTemp(input.vitals.tempC);
  const sbpScore  = scoreSBP(input.vitals.systolicBP);
  const hrScore   = scoreHR(input.vitals.hr);
  const mentScore = scoreMentalStatus(input.vitals.mentalStatus);
  const o2Score   = scoreO2Support(input.vitals.supplementalO2);
  const lacScore  = scoreLactate(input.labs?.lactate);

  push("rr",             input.vitals.rr             ?? "n/a", rrScore,   "Respiratory stress");
  push("spo2",           input.vitals.spo2            ?? "n/a", spo2Score, "Hypoxemia");
  push("tempC",          input.vitals.tempC           ?? "n/a", tempScore, "Temperature instability");
  push("systolicBP",     input.vitals.systolicBP      ?? "n/a", sbpScore,  "Hemodynamic compromise");
  push("hr",             input.vitals.hr              ?? "n/a", hrScore,   "Hemodynamic stress");
  push("mentalStatus",   input.vitals.mentalStatus    ?? "n/a", mentScore, "Neurologic deterioration");
  push("supplementalO2", input.vitals.supplementalO2 ? "yes" : "no", o2Score, "O2 support requirement");
  push("lactate",        input.labs?.lactate          ?? "n/a", lacScore,  "Tissue hypoperfusion");

  let score = rrScore + spo2Score + tempScore + sbpScore + hrScore + mentScore + o2Score + lacScore;

  if ((input.ageYears ?? 0) >= 75) {
    score += 1;
    explanation.push({ factor: "ageYears", value: input.ageYears!, impact: 1, note: "Advanced age risk modifier" });
  }

  return {
    patientId:        input.patientId,
    riskScore:        score,
    riskBand:         toBand(score),
    recommendedLevel: toLevel(score),
    explanation:      explanation.sort((a, b) => b.impact - a.impact),
    features: {
      complaint: input.complaint ?? null,
      ageYears:  input.ageYears  ?? null,
      vitals:    input.vitals,
      labs:      input.labs ?? {},
    },
  };
}

// ── DB-persisted prediction (async) ──────────────────────────────────────────

export async function predictAndStoreIcuRisk(
  input: PredictorInput
): Promise<PredictorResult> {
  const result = calculateIcuRisk(input);

  // Store patient snapshot
  await db.insert(patientSnapshots).values({
    patientId: input.patientId,
    clinicId:  input.clinicId ?? null,
    complaint: input.complaint ?? null,
    ageYears:  input.ageYears  ?? null,
    vitals:    input.vitals as Record<string, unknown>,
    labs:      (input.labs ?? {}) as Record<string, unknown>,
    timeline:  [],
    source:    "icu_predictor_v3",
  });

  // Persist prediction with physician review flag
  await db.insert(icuPredictions).values({
    patientId:               input.patientId,
    clinicId:                input.clinicId ?? null,
    riskScore:               result.riskScore,
    riskBand:                result.riskBand,
    recommendedLevel:        result.recommendedLevel,
    explanation:             result.explanation,
    features:                result.features,
    requiresPhysicianReview: true,
  });

  // FDA-ready audit step
  await auditStep({
    traceId:  `icu-predict-${input.patientId}-${Date.now()}`,
    step:     "icu_risk_predicted",
    input,
    output:   result,
    metadata: {
      modelVersion:            "icu-v3-news2-lactate",
      requiresPhysicianReview: true,
    },
  });

  return result;
}

export async function getLatestIcuPredictions(
  limit = 50
): Promise<typeof icuPredictions.$inferSelect[]> {
  return db
    .select()
    .from(icuPredictions)
    .orderBy(desc(icuPredictions.createdAt))
    .limit(limit);
}
