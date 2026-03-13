import { scoreCaseSimilarity } from "./similarityScorer"
import { outcomeQualityWeight } from "./similarityOutcomeScorer"

export function reinforcedSimilarityScore(current: any, prior: any): number {
  const base = scoreCaseSimilarity(current, prior)
  const weight = outcomeQualityWeight(prior)
  return Math.min(1.0, base * weight)
}

export function batchReinforcedScores(
  current: any,
  priors: any[]
): Array<{ similarityScore: number; reinforcedScore: number } & typeof priors[0]> {
  return priors
    .map((prior) => {
      const similarityScore = scoreCaseSimilarity(current, prior)
      const qualityWeight = outcomeQualityWeight(prior)
      const reinforcedScore = Math.min(1.0, similarityScore * qualityWeight)
      return { ...prior, similarityScore, reinforcedScore }
    })
    .sort((a, b) => b.reinforcedScore - a.reinforcedScore)
}
