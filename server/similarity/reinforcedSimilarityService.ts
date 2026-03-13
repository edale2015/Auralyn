import { extractCaseFeatures } from "./caseFeatureExtractor"
import { loadSimilarityIndex } from "./caseSimilarityStore"
import { reinforcedSimilarityScore } from "./outcomeReinforcedSimilarity"

export interface ReinforcedMatch {
  caseId: string
  complaint: string
  diagnosis?: string
  disposition: string
  similarityScore: number
  reinforcedScore: number
  outcomeWeight: number
  timestamp?: string
}

export async function findOutcomeReinforcedCases(
  state: any,
  limit = 15
): Promise<ReinforcedMatch[]> {
  const current = extractCaseFeatures(state)
  const index = await loadSimilarityIndex()

  return index
    .map((row: any) => {
      const score = reinforcedSimilarityScore(current, row)
      const weight = score > 0 && row.similarityScore
        ? score / Math.max(0.01, row.similarityScore ?? score)
        : 1.0
      return {
        caseId: row.caseId ?? "unknown",
        complaint: row.complaint ?? "unknown",
        diagnosis: row.diagnosis ?? row.differential?.[0],
        disposition: row.disposition ?? "unknown",
        similarityScore: score,
        reinforcedScore: score,
        outcomeWeight: weight,
        timestamp: row.timestamp,
      }
    })
    .sort((a, b) => b.reinforcedScore - a.reinforcedScore)
    .slice(0, limit)
}

export async function getDiagnosisDistributionFromSimilarCases(
  state: any,
  topN = 10
): Promise<Record<string, number>> {
  const matches = await findOutcomeReinforcedCases(state, topN)
  const votes: Record<string, number> = {}

  for (const m of matches) {
    const dx = m.diagnosis ?? "unknown"
    votes[dx] = (votes[dx] ?? 0) + m.reinforcedScore
  }

  const total = Object.values(votes).reduce((s, v) => s + v, 0)
  if (!total) return votes

  return Object.fromEntries(
    Object.entries(votes).map(([dx, v]) => [dx, v / total])
  )
}
