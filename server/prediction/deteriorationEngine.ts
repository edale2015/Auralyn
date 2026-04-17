/**
 * Deterioration Prediction Engine — early sepsis, shock, respiratory failure
 * Trend-aware: catches deterioration BEFORE crash via multi-point analysis.
 * Integrates with alert + escalation engines when thresholds are crossed.
 *
 * Also exports computeDeteriorationRisk() — lightweight streaming-vitals scorer
 * used by ICU simulator and real-time WebSocket pipeline.
 */

// ── Lightweight real-time scorer (ICU / IoT vitals stream) ───────────────────

export type StreamVitals = {
  hr:   number;
  bp:   number;   // systolic
  spo2: number;
  temp: number;
  rr?:  number;
};

export type StreamRisk = {
  sepsisRisk:       number;
  shockRisk:        number;
  deteriorating:    boolean;
  alert:            string | null;
  contributingFactors: string[];
  shockIndex:       number;
};

export function computeDeteriorationRisk(v: StreamVitals): StreamRisk {
  const hr   = Math.max(0,  Math.min(300, v.hr));
  const bp   = Math.max(0,  Math.min(300, v.bp));
  const spo2 = Math.max(0,  Math.min(100, v.spo2));
  const temp = Math.max(30, Math.min(45,  v.temp));
  const rr   = v.rr != null ? Math.max(0, Math.min(60, v.rr)) : null;

  let sepsis = 0; let shock = 0;
  const factors: string[] = [];

  if (temp > 38.3) { sepsis += 0.20; factors.push("Fever (>38.3°C)"); }
  else if (temp < 36.0) { sepsis += 0.15; factors.push("Hypothermia (<36°C)"); }
  if (hr > 100) { sepsis += 0.20; factors.push("Tachycardia (HR >100)"); }
  if (bp < 90) { sepsis += 0.30; shock += 0.40; factors.push("Hypotension (SBP <90)"); }
  else if (bp < 100) { sepsis += 0.10; shock += 0.15; factors.push("Low BP (<100)"); }
  if (spo2 < 92) { shock += 0.30; sepsis += 0.10; factors.push("Hypoxia (SpO₂ <92%)"); }
  else if (spo2 < 95) { shock += 0.10; factors.push("Low SpO₂ (<95%)"); }
  if (rr !== null && rr > 22) { sepsis += 0.20; factors.push("Tachypnea (RR >22)"); }

  const shockIndex = bp > 0 ? hr / bp : 0;
  if (shockIndex > 1.0) { shock += 0.25; factors.push(`Shock index >1.0 (${shockIndex.toFixed(2)})`); }

  const sepsisRisk = Math.min(sepsis, 1);
  const shockRisk  = Math.min(shock,  1);
  const deteriorating = sepsisRisk > 0.5 || shockRisk > 0.5;

  let alert: string | null = null;
  if (shockRisk > 0.7)        alert = "CRITICAL — Likely Shock";
  else if (sepsisRisk > 0.7)  alert = "CRITICAL — Likely Sepsis";
  else if (deteriorating)     alert = "WARNING — Deterioration Detected";

  return { sepsisRisk, shockRisk, deteriorating, alert, contributingFactors: factors, shockIndex };
}

export function processStreamVitals(patient: { id: string; vitals: StreamVitals; [k: string]: any }) {
  const risk = computeDeteriorationRisk(patient.vitals);
  return { ...patient, risk, alert: risk.alert, timestamp: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────

import { sendAlert }      from "../intervention/alertEngine";
import { escalatePatient } from "../intervention/escalationEngine";

export type DeteriorationRisk = "low" | "moderate" | "high" | "critical";

export interface DeteriorationResult {
  risk:        DeteriorationRisk;
  score:       number;
  flags:       string[];
  sepsisCriteria: boolean;
  shockCriteria:  boolean;
  respiratoryFailure: boolean;
  prediction:  string;
  autoActioned:boolean;
}

export interface DeteriorationPatient {
  id:     string;
  name?:  string;
  vitals: {
    hr:     number;
    bpSys:  number;
    spo2:   number;
    temp:   number;   // °F
    rr?:    number;
  };
  trend?: {
    hrTrend?:   number;
    spo2Trend?: number;
    bpTrend?:   number;
  };
}

export function predictDeterioration(patient: DeteriorationPatient): DeteriorationResult {
  let score          = 0;
  const flags:       string[] = [];
  const tempC        = (patient.vitals.temp - 32) / 1.8;

  // ── SIRS / Sepsis indicators ───────────────────────────────────────────────
  if (patient.vitals.hr > 100)           { score += 2; flags.push("tachycardia"); }
  if (tempC > 38.3 || tempC < 36)        { score += 2; flags.push("abnormal temp"); }
  if (patient.vitals.bpSys < 100)        { score += 3; flags.push("hypotension"); }
  if (patient.vitals.spo2 < 92)          { score += 3; flags.push("hypoxia"); }
  if (patient.vitals.rr && patient.vitals.rr > 20) { score += 2; flags.push("tachypnea"); }

  // ── Trend-based early detection (catches crash BEFORE thresholds) ──────────
  if (patient.trend?.bpTrend   && patient.trend.bpTrend   < -10) { score += 4; flags.push("dropping BP"); }
  if (patient.trend?.spo2Trend && patient.trend.spo2Trend < -3)  { score += 4; flags.push("rapid oxygen decline"); }
  if (patient.trend?.hrTrend   && patient.trend.hrTrend   > 15)  { score += 3; flags.push("rapidly rising HR"); }

  // ── Composite criteria ─────────────────────────────────────────────────────
  const sepsisScore     = (patient.vitals.hr > 90 ? 1 : 0) + (tempC > 38.3 || tempC < 36 ? 1 : 0) + (patient.vitals.bpSys < 100 ? 1 : 0);
  const sepsisCriteria  = sepsisScore >= 2;
  const shockCriteria   = patient.vitals.bpSys < 90 && patient.vitals.hr > 100;
  const respFailure     = patient.vitals.spo2 < 90 || (patient.vitals.rr ?? 0) > 25;

  if (sepsisCriteria) { score += 2; flags.push("SIRS criteria met"); }
  if (shockCriteria)  { score += 3; flags.push("shock criteria met"); }
  if (respFailure)    { score += 3; flags.push("respiratory failure risk"); }

  // ── Risk classification ────────────────────────────────────────────────────
  let risk: DeteriorationRisk;
  if      (score >= 12) risk = "critical";
  else if (score >= 8)  risk = "high";
  else if (score >= 4)  risk = "moderate";
  else                  risk = "low";

  const prediction =
    risk === "critical" ? "Imminent decompensation — septic shock / respiratory failure" :
    risk === "high"     ? "High risk of rapid deterioration — urgent intervention required" :
    risk === "moderate" ? "Deterioration risk — trend monitoring + clinical reassessment" :
    "Stable trajectory — continue standard monitoring";

  return {
    risk, score, flags, sepsisCriteria, shockCriteria,
    respiratoryFailure: respFailure, prediction, autoActioned: false,
  };
}

// ── Auto-trigger: predicts AND acts on critical/high deterioration ────────────
export async function handleDeterioration(patient: DeteriorationPatient): Promise<DeteriorationResult> {
  const result = predictDeterioration(patient);

  if (result.risk === "critical") {
    await sendAlert(
      `CRITICAL deterioration: ${patient.name ?? patient.id} — ${result.flags.slice(0, 4).join(", ")}`,
      "critical",
      patient.id,
      "deterioration-engine"
    );
    await escalatePatient({
      id:        patient.id,
      name:      patient.name,
      riskScore: 10,
      flags:     result.flags,
      reason:    result.prediction,
    });
    result.autoActioned = true;

  } else if (result.risk === "high") {
    await sendAlert(
      `HIGH deterioration risk: ${patient.name ?? patient.id} — ${result.flags.join(", ")}`,
      "high",
      patient.id,
      "deterioration-engine"
    );
    result.autoActioned = true;
  }

  return result;
}
