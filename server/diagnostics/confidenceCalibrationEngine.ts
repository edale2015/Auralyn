import { getAdjustedPriors } from "../learning/outcomeReinforcementTrainer"
import { getDiagnosisCorrectionMap } from "../learning/physicianFeedbackEngine"

export interface CalibratedDiagnosis {
  diagnosis: string
  rawProbability: number
  calibratedProbability: number
  adjustmentReason?: string
}

export function calibrateConfidence(
  differential: Array<{ diagnosis: string; score: number }>
): CalibratedDiagnosis[] {
  const total = differential.reduce((s, d) => s + (d.score ?? 0), 0)
  if (!total) return []

  return differential.map((d) => ({
    diagnosis: d.diagnosis,
    rawProbability: d.score / total,
    calibratedProbability: d.score / total,
  }))
}

export async function calibrateWithOutcomes(
  differential: Array<{ diagnosis: string; score: number }>
): Promise<CalibratedDiagnosis[]> {
  const [adjustedPriors, correctionMap] = await Promise.all([
    getAdjustedPriors(),
    getDiagnosisCorrectionMap(),
  ])

  const total = differential.reduce((s, d) => s + (d.score ?? 0), 0)
  if (!total) return []

  const calibrated = differential.map((d) => {
    let calibratedScore = d.score
    let reason: string | undefined

    const outcomePrior = adjustedPriors[d.diagnosis]
    if (outcomePrior !== undefined) {
      calibratedScore = calibratedScore * 0.7 + outcomePrior * 0.3 * total
      reason = `outcome-adjusted prior: ${(outcomePrior * 100).toFixed(1)}%`
    }

    const correctedTo = correctionMap[d.diagnosis]
    if (correctedTo) {
      calibratedScore *= 0.85
      reason = (reason ? reason + ", " : "") + `physician tends to correct to ${correctedTo}`
    }

    return {
      diagnosis: d.diagnosis,
      rawProbability: d.score / total,
      calibratedProbability: calibratedScore,
      adjustmentReason: reason,
    }
  })

  const calibratedTotal = calibrated.reduce((s, d) => s + d.calibratedProbability, 0)
  return calibrated
    .map((d) => ({
      ...d,
      calibratedProbability: calibratedTotal ? d.calibratedProbability / calibratedTotal : 0,
    }))
    .sort((a, b) => b.calibratedProbability - a.calibratedProbability)
}
