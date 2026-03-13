import type { OutcomeCaseRecord } from "./outcomeCaseMemory"

export function outcomeQualityWeight(row: Partial<OutcomeCaseRecord> & { outcome?: any }): number {
  const outcome = row.outcome ?? row
  if (!outcome) return 0.5

  let weight = 1.0

  if (outcome.topPredictionMatch) weight += 0.5
  if (outcome.dispositionMatch) weight += 0.5
  if (outcome.actualDiagnosis) weight += 0.2
  if (outcome.safetyMiss) weight -= 1.2
  if (outcome.physicianCorrection) weight -= 0.2

  return Math.max(0.1, Math.min(2.5, weight))
}

export function rankByOutcomeQuality(rows: any[]): any[] {
  return [...rows]
    .map((r) => ({ ...r, outcomeWeight: outcomeQualityWeight(r) }))
    .sort((a, b) => b.outcomeWeight - a.outcomeWeight)
}
