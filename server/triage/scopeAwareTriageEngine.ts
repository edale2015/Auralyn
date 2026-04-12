/**
 * Scope-Aware Triage Engine — risk scoring with dynamic permission expansion
 * Combines NEWS2 (0.7 weight) + qSOFA (0.3 weight) → triage level → scope level
 * Higher risk patient → more agent permissions unlocked automatically
 */

import { computeNEWS2 }    from "../engines/interventionEngine";
import { augmentScopeWithRisk, getRiskLabel } from "../scope/riskBasedScope";
import { scopeEngine }     from "../scope/agentScopeEngine";
import type { ScopeRule }  from "../scope/agentScopeEngine";

export type TriageLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface TriageVitals {
  hr:          number;
  spo2:        number;
  temp:        number;     // °F
  systolicBP:  number;
  rr?:         number;
  alteredMentalStatus?: boolean;
}

export interface TriageResult {
  patientId:         string;
  news2Score:        number;
  qsofaScore:        number;
  riskScore:         number;          // Composite: NEWS2×0.7 + qSOFA×0.3
  level:             TriageLevel;
  allowedScopeLevel: number;          // 1=minimal, 2=moderate, 3=high, 4=critical
  augmentedPermissions: string[];     // Dynamically unlocked actions
}

// ── qSOFA (Quick Sepsis-related Organ Failure Assessment) ────────────────────
// 1 point each: altered mental status, RR ≥ 22, SBP ≤ 100
export function calculateQSOFA(vitals: TriageVitals): number {
  let score = 0;
  if (vitals.alteredMentalStatus)              score += 1;
  if ((vitals.rr ?? 16) >= 22)                 score += 1;
  if (vitals.systolicBP <= 100)                score += 1;
  return score;
}

// ── Scope level 1–4 from triage level ────────────────────────────────────────
function scopeLevel(level: TriageLevel): number {
  return level === "CRITICAL" ? 4 : level === "HIGH" ? 3 : level === "MODERATE" ? 2 : 1;
}

export function evaluatePatientRisk(patient: { id: string; vitals: TriageVitals; symptoms?: string[]; age?: number }): TriageResult {
  const news2      = computeNEWS2({ ...patient.vitals, spo2: patient.vitals.spo2, temp: patient.vitals.temp });
  const qsofa      = calculateQSOFA(patient.vitals);
  const composite  = news2 * 0.7 + qsofa * 3 * 0.3;   // qSOFA max=3, normalize weight
  const riskLabel  = getRiskLabel(composite);

  // Get base triage_agent scope + augment with risk-based permissions
  const baseRole   = scopeEngine.getRole("triage_agent");
  const augmented  = baseRole ? augmentScopeWithRisk({ express: baseRole.express }, riskLabel) : { express: [] };

  return {
    patientId:            patient.id,
    news2Score:           news2,
    qsofaScore:           qsofa,
    riskScore:            Math.round(composite * 100) / 100,
    level:                riskLabel,
    allowedScopeLevel:    scopeLevel(riskLabel),
    augmentedPermissions: augmented.express,
  };
}

export function rankPatients(patients: Array<{ id: string; vitals: TriageVitals; symptoms?: string[]; age?: number }>) {
  return patients
    .map(evaluatePatientRisk)
    .sort((a, b) => b.riskScore - a.riskScore);
}
