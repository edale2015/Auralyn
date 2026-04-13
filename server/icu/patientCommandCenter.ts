/**
 * Multi-Patient Command Engine
 * Ranks patients by deterioration risk to prioritize physician attention.
 */

import { computeRisk, type PatientState, type RiskPrediction } from "./predictiveEngine";

export interface RankedPatient extends PatientState {
  risk: RiskPrediction;
  rank: number;
}

export function rankPatients(patients: PatientState[]): RankedPatient[] {
  return patients
    .map(p => ({ ...p, risk: computeRisk(p) }))
    .sort((a, b) => b.risk.deteriorationScore - a.risk.deteriorationScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export function getCriticalPatients(patients: PatientState[]): RankedPatient[] {
  return rankPatients(patients).filter(p => p.risk.riskLabel === "CRITICAL" || p.risk.riskLabel === "HIGH");
}

export function getPatientSummary(patients: PatientState[]) {
  const ranked = rankPatients(patients);
  return {
    total: ranked.length,
    critical: ranked.filter(p => p.risk.riskLabel === "CRITICAL").length,
    high: ranked.filter(p => p.risk.riskLabel === "HIGH").length,
    moderate: ranked.filter(p => p.risk.riskLabel === "MODERATE").length,
    low: ranked.filter(p => p.risk.riskLabel === "LOW").length,
    topPatient: ranked[0] ?? null,
    ranked,
  };
}
