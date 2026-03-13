export interface ConsensusSource {
  name: string
  weight: number
  results: Array<{ diagnosis: string; score: number }>
}

export interface ConsensusResult {
  diagnosis: string
  consensusScore: number
  votes: Record<string, number>
  sources: string[]
}

export function computeDiagnosticConsensus(
  sources: ConsensusSource[]
): ConsensusResult[] {
  const votes: Record<string, { score: number; bySource: Record<string, number>; sources: string[] }> = {}

  for (const source of sources) {
    if (!source.results?.length) continue

    const maxScore = Math.max(...source.results.map((r) => r.score), 0.001)

    for (const r of source.results) {
      const dx = r.diagnosis ?? "unknown"
      const normalized = (r.score / maxScore) * source.weight

      votes[dx] ??= { score: 0, bySource: {}, sources: [] }
      votes[dx].score += normalized
      votes[dx].bySource[source.name] = normalized

      if (!votes[dx].sources.includes(source.name)) {
        votes[dx].sources.push(source.name)
      }
    }
  }

  const maxScore = Math.max(...Object.values(votes).map((v) => v.score), 0.001)

  return Object.entries(votes)
    .map(([diagnosis, v]) => ({
      diagnosis,
      consensusScore: v.score / maxScore,
      votes: v.bySource,
      sources: v.sources,
    }))
    .sort((a, b) => b.consensusScore - a.consensusScore)
}

export function buildConsensusSources(
  ruleDifferential: any[],
  graphReasoningResults: any[],
  similarCaseDistribution: Record<string, number>,
  confidenceResults: any[]
): ConsensusSource[] {
  return [
    {
      name: "rule_engine",
      weight: 0.40,
      results: ruleDifferential.map((d) => ({
        diagnosis: typeof d === "string" ? d : d.diagnosis,
        score: d.score ?? 0.3,
      })),
    },
    {
      name: "evidence_graph",
      weight: 0.20,
      results: graphReasoningResults.map((r) => ({
        diagnosis: r.diagnosis,
        score: r.score,
      })),
    },
    {
      name: "similar_cases",
      weight: 0.25,
      results: Object.entries(similarCaseDistribution).map(([diagnosis, prob]) => ({
        diagnosis,
        score: prob,
      })),
    },
    {
      name: "bayesian_confidence",
      weight: 0.15,
      results: confidenceResults.map((r) => ({
        diagnosis: r.diagnosis,
        score: r.probability ?? r.confidence,
      })),
    },
  ]
}
