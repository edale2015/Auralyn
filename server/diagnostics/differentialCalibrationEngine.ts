export interface CalibrationInput {
  diagnosis: string
  score: number
  [key: string]: any
}

export function calibrateDifferential(
  differential: CalibrationInput[],
  similarCases: any[]
): CalibrationInput[] {
  const outcomeVotes: Record<string, number> = {}

  for (const c of similarCases) {
    const dx =
      c.outcome?.actualDiagnosis ??
      c.actualDiagnosis ??
      c.diagnosis ??
      c.differential?.[0]
    if (!dx) continue
    outcomeVotes[dx] = (outcomeVotes[dx] ?? 0) + (c.reinforcedScore ?? c.similarityScore ?? 0.1)
  }

  const calibrated = differential.map((d) => ({
    ...d,
    calibratedScore: (d.score ?? 0) + (outcomeVotes[d.diagnosis] ?? 0) * 0.3,
  }))

  return calibrated.sort((a, b) => b.calibratedScore - a.calibratedScore)
}

export function calibrateProbabilities(differential: any[]): any[] {
  const total = differential.reduce((s, d) => s + (d.calibratedScore ?? d.score ?? 0), 0)
  if (!total) return differential

  return differential.map((d) => ({
    ...d,
    calibratedProbability: (d.calibratedScore ?? d.score ?? 0) / total,
  }))
}
