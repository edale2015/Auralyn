/**
 * Bayesian Trajectory Model — patient deterioration probability estimation
 *
 * Uses Beta-Binomial conjugate model with Kalman-style state propagation.
 *
 * The model maintains a Beta(α, β) distribution over the probability that
 * a patient will deteriorate. Each observation (abnormal vital, rising SOFA,
 * worsening lab) is a "success" (deterioration signal); each reassuring
 * observation is a "failure". The posterior is updated sequentially.
 *
 * Prediction: Forward-project using mean reversion with noise term.
 *
 * Clinical note: Output is decision support only. Not a validated clinical
 * scoring system. Must be reviewed by a physician before clinical action.
 */

import type { SofaResult } from "./sofaCalculator";
import type { LabPanel } from "../../shared/schema";

export interface VitalObservation {
  timestamp: Date;
  hr?: number;
  spo2?: number;
  sbp?: number;
  dbp?: number;
  temp?: number;     // °F
  rr?: number;
  gcs?: number;
  sofaScore?: number;
}

export interface BayesianObservation {
  timestamp: Date;
  signal: "deterioration" | "reassuring" | "neutral";
  weight: number;    // 0.1–2.0 — how strong the signal is
  source: string;    // "vitals" | "sofa" | "lab_cbc" | "lab_cmp" | "lab_abg" | "ventilator"
  detail: string;
}

export interface BayesianState {
  alpha: number;     // Beta distribution α (deterioration events)
  beta: number;      // Beta distribution β (reassuring events)
  mean: number;      // α / (α + β)
  variance: number;  // α·β / (α+β)²(α+β+1)
  lower95: number;   // 2.5th percentile
  upper95: number;   // 97.5th percentile
}

export interface HorizonRisk {
  h1:  number;       // 1-hour deterioration probability
  h4:  number;       // 4-hour
  h12: number;       // 12-hour
  h24: number;       // 24-hour
}

export interface BayesianTrajectoryResult {
  state:        BayesianState;
  trend:        "improving" | "stable" | "worsening" | "rapidly_worsening";
  horizonRisk:  HorizonRisk;
  observations: BayesianObservation[];
  sofaDelta:    number | null;
  flags:        string[];
  caveat:       string;
}

function betaCI(alpha: number, beta: number): { lower: number; upper: number } {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const sd = Math.sqrt(variance);
  return {
    lower: Math.max(0, mean - 1.96 * sd),
    upper: Math.min(1, mean + 1.96 * sd),
  };
}

function betaState(alpha: number, beta: number): BayesianState {
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const ci = betaCI(alpha, beta);
  return { alpha, beta, mean, variance, lower95: ci.lower, upper95: ci.upper };
}

function forwardProject(mean: number, trendFactor: number, hours: number): number {
  const drift = trendFactor * Math.sqrt(hours / 24);
  return Math.max(0, Math.min(1, mean + drift));
}

export function extractVitalObservations(vitals: VitalObservation[]): BayesianObservation[] {
  const obs: BayesianObservation[] = [];
  for (let i = 1; i < vitals.length; i++) {
    const prev = vitals[i - 1];
    const curr = vitals[i];
    const ts   = curr.timestamp;

    if (curr.spo2 !== undefined && prev.spo2 !== undefined) {
      const delta = curr.spo2 - prev.spo2;
      if (delta <= -5)       obs.push({ timestamp: ts, signal: "deterioration", weight: 1.5, source: "vitals", detail: `SpO2 ↓${Math.abs(delta).toFixed(1)}%` });
      else if (delta <= -2)  obs.push({ timestamp: ts, signal: "deterioration", weight: 0.8, source: "vitals", detail: `SpO2 ↓${Math.abs(delta).toFixed(1)}%` });
      else if (delta >= 3)   obs.push({ timestamp: ts, signal: "reassuring",   weight: 0.7, source: "vitals", detail: `SpO2 ↑${delta.toFixed(1)}%` });
    }

    if (curr.sbp !== undefined && prev.sbp !== undefined) {
      const delta = curr.sbp - prev.sbp;
      if (delta <= -30)      obs.push({ timestamp: ts, signal: "deterioration", weight: 1.5, source: "vitals", detail: `SBP ↓${Math.abs(delta)}` });
      else if (delta <= -15) obs.push({ timestamp: ts, signal: "deterioration", weight: 0.9, source: "vitals", detail: `SBP ↓${Math.abs(delta)}` });
      else if (delta >= 20 && (curr.sbp ?? 0) < 160) obs.push({ timestamp: ts, signal: "reassuring", weight: 0.6, source: "vitals", detail: `SBP recovering +${delta}` });
    }

    if (curr.hr !== undefined && prev.hr !== undefined) {
      const delta = curr.hr - prev.hr;
      if (delta >= 25 || (curr.hr ?? 0) > 130)    obs.push({ timestamp: ts, signal: "deterioration", weight: 1.0, source: "vitals", detail: `HR ↑${delta} → ${curr.hr}` });
      else if (delta <= -25 && (curr.hr ?? 0) > 50) obs.push({ timestamp: ts, signal: "reassuring",  weight: 0.6, source: "vitals", detail: `HR normalizing` });
    }

    if (curr.rr !== undefined && prev.rr !== undefined) {
      const delta = curr.rr - prev.rr;
      if (delta >= 6 || (curr.rr ?? 0) > 28) obs.push({ timestamp: ts, signal: "deterioration", weight: 1.2, source: "vitals", detail: `RR ↑${delta} → ${curr.rr}/min` });
    }

    if (curr.sofaScore !== undefined && prev.sofaScore !== undefined) {
      const delta = curr.sofaScore - prev.sofaScore;
      if (delta >= 2)      obs.push({ timestamp: ts, signal: "deterioration", weight: 2.0, source: "sofa",   detail: `SOFA +${delta} → ${curr.sofaScore}` });
      else if (delta === 1) obs.push({ timestamp: ts, signal: "deterioration", weight: 1.2, source: "sofa",  detail: `SOFA +1 → ${curr.sofaScore}` });
      else if (delta <= -2) obs.push({ timestamp: ts, signal: "reassuring",   weight: 1.5, source: "sofa",   detail: `SOFA −${Math.abs(delta)} → ${curr.sofaScore}` });
    }
  }
  return obs;
}

export function extractLabObservations(labs: LabPanel[]): BayesianObservation[] {
  const obs: BayesianObservation[] = [];
  for (const lab of labs) {
    const ts = lab.collectedAt;

    if (lab.lactate !== undefined) {
      if (lab.lactate > 4)       obs.push({ timestamp: ts, signal: "deterioration", weight: 2.0, source: "lab_abg", detail: `Lactate ${lab.lactate} mmol/L (severe)` });
      else if (lab.lactate > 2)  obs.push({ timestamp: ts, signal: "deterioration", weight: 1.3, source: "lab_abg", detail: `Lactate ${lab.lactate} mmol/L (elevated)` });
      else if (lab.lactate < 1)  obs.push({ timestamp: ts, signal: "reassuring",   weight: 0.8, source: "lab_abg", detail: `Lactate normal ${lab.lactate}` });
    }

    if (lab.ph !== undefined) {
      if (lab.ph < 7.20)        obs.push({ timestamp: ts, signal: "deterioration", weight: 2.0, source: "lab_abg", detail: `Severe acidosis pH ${lab.ph}` });
      else if (lab.ph < 7.32)   obs.push({ timestamp: ts, signal: "deterioration", weight: 1.2, source: "lab_abg", detail: `Metabolic acidosis pH ${lab.ph}` });
      else if (lab.ph > 7.50)   obs.push({ timestamp: ts, signal: "deterioration", weight: 0.9, source: "lab_abg", detail: `Alkalosis pH ${lab.ph}` });
    }

    if (lab.plt !== undefined) {
      if (lab.plt < 20)         obs.push({ timestamp: ts, signal: "deterioration", weight: 2.0, source: "lab_cbc", detail: `Plt ${lab.plt} — severe thrombocytopenia` });
      else if (lab.plt < 50)    obs.push({ timestamp: ts, signal: "deterioration", weight: 1.5, source: "lab_cbc", detail: `Plt ${lab.plt}` });
      else if (lab.plt < 100)   obs.push({ timestamp: ts, signal: "deterioration", weight: 0.8, source: "lab_cbc", detail: `Plt ${lab.plt}` });
    }

    if (lab.creatinine !== undefined) {
      if (lab.creatinine >= 5.0) obs.push({ timestamp: ts, signal: "deterioration", weight: 2.0, source: "lab_cmp", detail: `Cr ${lab.creatinine} — AKI stage 3` });
      else if (lab.creatinine >= 2.0) obs.push({ timestamp: ts, signal: "deterioration", weight: 1.3, source: "lab_cmp", detail: `Cr ${lab.creatinine}` });
    }

    if (lab.totalBilirubin !== undefined && lab.totalBilirubin >= 6) {
      obs.push({ timestamp: ts, signal: "deterioration", weight: 1.5, source: "lab_cmp", detail: `Bili ${lab.totalBilirubin} — hepatic dysfunction` });
    }

    if (lab.wbc !== undefined) {
      if (lab.wbc > 20 || lab.wbc < 2) obs.push({ timestamp: ts, signal: "deterioration", weight: 1.0, source: "lab_cbc", detail: `WBC ${lab.wbc} (dysregulated)` });
    }

    if (lab.procalcitonin !== undefined && lab.procalcitonin > 10) {
      obs.push({ timestamp: ts, signal: "deterioration", weight: 1.5, source: "lab_cbc", detail: `PCT ${lab.procalcitonin} — bacterial sepsis likely` });
    }
  }
  return obs;
}

export function runBayesianTrajectory(params: {
  vitals:         VitalObservation[];
  labs:           LabPanel[];
  sofaHistory:    Array<{ scoredAt: Date; totalScore: number }>;
  priorAlpha?:    number;
  priorBeta?:     number;
}): BayesianTrajectoryResult {
  const { vitals, labs, sofaHistory } = params;

  let alpha = params.priorAlpha ?? 1;
  let beta  = params.priorBeta  ?? 4;  // prior: 20% baseline deterioration risk

  const allObs: BayesianObservation[] = [
    ...extractVitalObservations(vitals),
    ...extractLabObservations(labs),
  ];

  allObs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const obs of allObs) {
    if (obs.signal === "deterioration") alpha += obs.weight;
    else if (obs.signal === "reassuring") beta += obs.weight;
  }

  const state = betaState(alpha, beta);
  const { mean } = state;

  const sofaDelta = sofaHistory.length >= 2
    ? sofaHistory[sofaHistory.length - 1].totalScore - sofaHistory[sofaHistory.length - 2].totalScore
    : null;

  const recentDeteriorations = allObs.filter(o => o.signal === "deterioration").slice(-5);
  const recentReassuring     = allObs.filter(o => o.signal === "reassuring").slice(-5);
  const recentDScore = recentDeteriorations.reduce((s, o) => s + o.weight, 0);
  const recentRScore = recentReassuring.reduce((s, o) => s + o.weight, 0);
  const trendFactor  = (recentDScore - recentRScore) * 0.02 + (sofaDelta ?? 0) * 0.015;

  const trend: BayesianTrajectoryResult["trend"] =
    trendFactor > 0.08 ? "rapidly_worsening" :
    trendFactor > 0.02 ? "worsening" :
    trendFactor < -0.02 ? "improving" : "stable";

  const horizonRisk: HorizonRisk = {
    h1:  parseFloat(forwardProject(mean, trendFactor, 1).toFixed(3)),
    h4:  parseFloat(forwardProject(mean, trendFactor, 4).toFixed(3)),
    h12: parseFloat(forwardProject(mean, trendFactor, 12).toFixed(3)),
    h24: parseFloat(forwardProject(mean, trendFactor, 24).toFixed(3)),
  };

  const flags: string[] = [];
  if (mean > 0.7)              flags.push("Posterior mean >70% — high deterioration probability");
  if (sofaDelta !== null && sofaDelta >= 2) flags.push("SOFA rose ≥2 points — sepsis progression");
  if (horizonRisk.h4 > 0.6)   flags.push("4-hour projected risk >60% — consider ICU escalation");
  if (state.upper95 > 0.9)    flags.push("95% CI upper bound >90% — worst case is critical");
  if (recentDScore > 4 && recentDeteriorations.length >= 3) flags.push("Rapid multi-organ signal convergence");

  return {
    state,
    trend,
    horizonRisk,
    observations: allObs,
    sofaDelta,
    flags,
    caveat: "Bayesian trajectory model is decision support only, not a validated clinical scoring system. All outputs require physician review before clinical action.",
  };
}
