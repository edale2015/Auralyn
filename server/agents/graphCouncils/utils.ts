import type { AgentOutput, ConsensusResult, PatientContext } from "./types";

export function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

export function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function maxRiskFromOutputs(outputs: AgentOutput[]): number {
  return clamp(Math.max(...outputs.map(o => Number(o.result.risk ?? 0)), 0));
}

export function urgencyFromRisk(risk: number): ConsensusResult["urgency"] {
  if (risk >= 0.85) return "critical";
  if (risk >= 0.65) return "urgent";
  if (risk >= 0.35) return "expedited";
  return "routine";
}

export function hasAny(items: string[] | undefined, ...needles: string[]): boolean {
  const set = new Set((items || []).map(s => s.toLowerCase()));
  return needles.some(n => set.has(n.toLowerCase()));
}

export function vitalsRisk(patient: PatientContext): number {
  const v = patient.vitals || {};
  let risk = 0;
  if ((v.spo2 ?? 100) < 90) risk += 0.35;
  if ((v.systolic ?? 120) < 90) risk += 0.35;
  if ((v.hr ?? 80) > 120) risk += 0.2;
  if ((v.temp ?? 37) > 39) risk += 0.1;
  return clamp(risk);
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function mergeStringArrays(outputs: AgentOutput[], field: string): string[] {
  return dedupeStrings(outputs.flatMap(o => Array.isArray(o.result[field]) ? (o.result[field] as string[]) : []));
}
