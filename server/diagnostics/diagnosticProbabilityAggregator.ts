import { DIAGNOSTIC_MODELS } from "./diagnosticConfidenceModel"
import type { DiagnosticEvidence } from "./diagnosticEvidenceService"

export function computeDiagnosisProbability(
  diagnosis: string,
  evidence: DiagnosticEvidence
): number {
  const key = diagnosis.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_")
  const model = DIAGNOSTIC_MODELS[key]
  if (!model) return 0.05

  let score = model.prior
  for (const [feature, likelihood] of Object.entries(model.likelihoods)) {
    if (evidence[feature]) score *= likelihood
  }
  if (model.redFlagPenalties) {
    for (const [feature, penalty] of Object.entries(model.redFlagPenalties)) {
      if (evidence[feature]) score += penalty
    }
  }
  return Math.max(0.001, Math.min(1, score))
}

export function normalizeProbabilities(
  results: Array<{ diagnosis: string; probability: number }>
): Array<{ diagnosis: string; probability: number }> {
  const total = results.reduce((s, r) => s + r.probability, 0)
  if (total === 0) return results
  return results.map((r) => ({ ...r, probability: r.probability / total }))
}
