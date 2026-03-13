import { extractCaseFeatures } from "./caseFeatureExtractor"
import { loadSimilarityIndex } from "./caseSimilarityStore"
import { scoreOutcomeWeightedSimilarity } from "./outcomeWeightedSimilarity"
import { aggregateDifferentialVotes, type DifferentialVote } from "./differentialVoteAggregator"
import { aggregateDifferential, type DifferentialCandidate } from "../assistant/differentialAggregator"

export interface WeightedDifferentialResult {
  similarCases: any[]
  voteDifferential: DifferentialVote[]
  ruleDifferential: DifferentialCandidate[]
  combinedDifferential: Array<{
    diagnosis: string
    combinedScore: number
    ruleScore: number
    similarityScore: number
    outcomeConfirmed: boolean
    signals: string[]
  }>
}

export async function computeSimilarityWeightedDifferential(
  state: any
): Promise<WeightedDifferentialResult> {
  const current = extractCaseFeatures(state)
  const index = await loadSimilarityIndex()

  const scored = index
    .filter((row: any) => row.caseId !== current.caseId)
    .map((row: any) => ({
      ...row,
      similarityScore: scoreOutcomeWeightedSimilarity(current, row),
    }))
    .filter((row: any) => row.similarityScore > 0.05)
    .sort((a: any, b: any) => b.similarityScore - a.similarityScore)
    .slice(0, 10)

  const votes = aggregateDifferentialVotes(scored)

  const ruleDx = aggregateDifferential({
    complaint: state.complaint ?? "unknown",
    symptoms: state.symptoms ?? "",
    age: state.patient?.age,
    sex: state.patient?.sex,
    similarityVotes: votes.slice(0, 5).map(v => ({ diagnosis: v.diagnosis, score: v.score })),
  })

  const combined: Record<string, {
    combinedScore: number
    ruleScore: number
    similarityScore: number
    outcomeConfirmed: boolean
    signals: string[]
  }> = {}

  for (const dx of ruleDx) {
    combined[dx.diagnosis] = {
      combinedScore: dx.score * 0.6,
      ruleScore: dx.score,
      similarityScore: 0,
      outcomeConfirmed: false,
      signals: dx.signals,
    }
  }

  for (const vote of votes) {
    const name = vote.diagnosis
    const matchKey = Object.keys(combined).find(k =>
      k.toLowerCase().includes(name.toLowerCase().split("_")[0]) ||
      name.toLowerCase().includes(k.toLowerCase().split(" ")[0])
    )

    if (matchKey) {
      combined[matchKey].similarityScore = vote.score
      combined[matchKey].combinedScore += vote.score * 0.4
      if (vote.outcomeConfirmed) combined[matchKey].outcomeConfirmed = true
      combined[matchKey].signals.push(`similar cases: ${vote.supportingCases}`)
    } else {
      combined[name] = {
        combinedScore: vote.score * 0.4,
        ruleScore: 0,
        similarityScore: vote.score,
        outcomeConfirmed: vote.outcomeConfirmed,
        signals: [`from ${vote.supportingCases} similar case(s)`],
      }
    }
  }

  const combinedDifferential = Object.entries(combined)
    .map(([diagnosis, v]) => ({ diagnosis, ...v, combinedScore: Math.min(1, v.combinedScore) }))
    .sort((a, b) => b.combinedScore - a.combinedScore)

  return {
    similarCases: scored,
    voteDifferential: votes,
    ruleDifferential: ruleDx,
    combinedDifferential,
  }
}
