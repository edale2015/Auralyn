import { scoreCaseSimilarity } from "./similarityScorer"

function outcomeWeight(row: any): number {
  if (!row.outcome) return 0.5

  let weight = 1.0
  if (row.outcome.topPredictionMatch) weight += 0.5
  if (row.outcome.dispositionMatch) weight += 0.5
  if (row.outcome.safetyMiss) weight -= 1.5

  return Math.max(0, weight)
}

export function scoreOutcomeWeightedSimilarity(
  current: any,
  prior: any
): number {
  const similarity = scoreCaseSimilarity(current, prior)
  const weight = outcomeWeight(prior)
  return Math.min(1, similarity * weight)
}
