import { loadOutcomeMemory } from "../similarity/outcomeCaseMemory"

export interface OutcomeModelStats {
  diagnosis: string
  count: number
  avgTopPredictionMatch: number
  avgDispositionMatch: number
  safetyMissRate: number
  correctionRate: number
}

export async function trainOutcomeModel(): Promise<Record<string, OutcomeModelStats>> {
  const rows = await loadOutcomeMemory()
  const stats: Record<
    string,
    {
      count: number
      topMatch: number
      dispMatch: number
      safetyMisses: number
      corrections: number
    }
  > = {}

  for (const r of rows) {
    const dx = r.actualDiagnosis ?? r.differential?.[0] ?? "unknown"
    stats[dx] ??= { count: 0, topMatch: 0, dispMatch: 0, safetyMisses: 0, corrections: 0 }
    stats[dx].count++
    if (r.topPredictionMatch) stats[dx].topMatch++
    if (r.dispositionMatch) stats[dx].dispMatch++
    if (r.safetyMiss) stats[dx].safetyMisses++
    if (r.physicianCorrection) stats[dx].corrections++
  }

  const result: Record<string, OutcomeModelStats> = {}
  for (const [dx, s] of Object.entries(stats)) {
    result[dx] = {
      diagnosis: dx,
      count: s.count,
      avgTopPredictionMatch: s.count ? s.topMatch / s.count : 0,
      avgDispositionMatch: s.count ? s.dispMatch / s.count : 0,
      safetyMissRate: s.count ? s.safetyMisses / s.count : 0,
      correctionRate: s.count ? s.corrections / s.count : 0,
    }
  }

  return result
}

export async function getAdjustedPriors(): Promise<Record<string, number>> {
  const model = await trainOutcomeModel()
  const total = Object.values(model).reduce((s, m) => s + m.count, 0)
  if (!total) return {}

  const priors: Record<string, number> = {}
  for (const [dx, m] of Object.entries(model)) {
    let base = m.count / total
    base *= 1 + m.avgTopPredictionMatch * 0.3
    base *= 1 - m.safetyMissRate * 0.5
    priors[dx] = Math.max(0.001, base)
  }

  const sum = Object.values(priors).reduce((s, v) => s + v, 0)
  return Object.fromEntries(Object.entries(priors).map(([dx, v]) => [dx, v / sum]))
}
