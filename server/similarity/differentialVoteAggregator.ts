export interface DifferentialVote {
  diagnosis: string
  score: number
  supportingCases: number
  outcomeConfirmed: boolean
}

export function aggregateDifferentialVotes(
  similarCases: any[]
): DifferentialVote[] {
  const votes: Record<string, { score: number; cases: number; confirmed: boolean }> = {}

  for (const c of similarCases) {
    const diagnoses: string[] = []

    if (c.outcome?.actualDiagnosis) diagnoses.push(c.outcome.actualDiagnosis)
    if (c.differential?.length) diagnoses.push(...c.differential.slice(0, 3))

    const weight = c.similarityScore ?? 0
    const confirmed = Boolean(c.outcome?.actualDiagnosis && c.outcome?.topPredictionMatch)

    for (const dx of [...new Set(diagnoses)]) {
      if (!votes[dx]) votes[dx] = { score: 0, cases: 0, confirmed: false }
      votes[dx].score += weight
      votes[dx].cases++
      if (confirmed) votes[dx].confirmed = true
    }
  }

  return Object.entries(votes)
    .map(([diagnosis, v]) => ({
      diagnosis,
      score: v.score,
      supportingCases: v.cases,
      outcomeConfirmed: v.confirmed,
    }))
    .sort((a, b) => b.score - a.score)
}
