import { appendImpact } from "./questionPolicyStore"
import type { QuestionImpact } from "./questionPolicyTypes"

function shannonEntropy(probs: number[]): number {
  const total = probs.reduce((s, p) => s + p, 0)
  if (total === 0) return 0
  return probs.reduce((h, p) => {
    const pn = p / total
    return pn > 0 ? h - pn * Math.log2(pn) : h
  }, 0)
}

function extractProbs(differential: any[]): number[] {
  if (!differential?.length) return []
  return differential.map((d) =>
    typeof d === "string" ? 1 / differential.length : d.score ?? d.probability ?? 1 / differential.length
  )
}

export async function recordQuestionImpact(
  caseId: string,
  complaint: string,
  question: string,
  stateBefore: any,
  stateAfter: any
): Promise<QuestionImpact> {
  const probsBefore = extractProbs(stateBefore.differential ?? [])
  const probsAfter = extractProbs(stateAfter.differential ?? [])

  const entropyBefore = shannonEntropy(probsBefore)
  const entropyAfter = shannonEntropy(probsAfter)
  const entropyReduction = entropyBefore - entropyAfter

  const topDxBefore =
    (typeof stateBefore.differential?.[0] === "string"
      ? stateBefore.differential[0]
      : stateBefore.differential?.[0]?.diagnosis) ?? "unknown"

  const topDxAfter =
    (typeof stateAfter.differential?.[0] === "string"
      ? stateAfter.differential[0]
      : stateAfter.differential?.[0]?.diagnosis) ?? "unknown"

  const impact: QuestionImpact = {
    question,
    caseId,
    complaint,
    entropyBefore,
    entropyAfter,
    entropyReduction,
    topDxBefore,
    topDxAfter,
    diagnosisShifted: topDxBefore !== topDxAfter,
    dispositionChanged: stateBefore.disposition !== stateAfter.disposition,
    timestamp: new Date().toISOString(),
  }

  await appendImpact(impact)
  return impact
}

export async function analyzeImpactHistory(
  question: string,
  complaint: string
) {
  const { loadImpacts } = await import("./questionPolicyStore")
  const impacts = await loadImpacts()
  const relevant = impacts.filter(
    (i) => i.question === question && i.complaint === complaint
  )
  if (!relevant.length) return null

  const avgReduction =
    relevant.reduce((s, i) => s + i.entropyReduction, 0) / relevant.length
  const pctShifted = relevant.filter((i) => i.diagnosisShifted).length / relevant.length
  const pctChangedDisp =
    relevant.filter((i) => i.dispositionChanged).length / relevant.length

  return {
    question,
    complaint,
    sampleSize: relevant.length,
    avgEntropyReduction: avgReduction,
    pctDiagnosisShifted: pctShifted,
    pctDispositionChanged: pctChangedDisp,
  }
}
