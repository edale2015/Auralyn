import { computeAdaptiveQuestions, extractPresentFeatures } from "../assistant/adaptiveQuestionEngine"
import { recordQuestionImpact } from "./questionImpactAnalyzer"
import { getPolicy } from "./questionPolicyStore"
import { publishEvent } from "../core/events/eventPublisher"

export interface WeightedQuestion {
  text: string
  expectedInfoGain: number
  policyWeight: number
  adjustedScore: number
  targetDiagnoses: string[]
}

export async function getWeightedAdaptiveQuestions(
  state: any,
  external?: any[]
): Promise<WeightedQuestion[]> {
  const complaint = state.complaint ?? "cough"
  const symptomsText = state.symptoms ?? ""
  const presentFeatures = extractPresentFeatures(symptomsText, complaint)
  const result = computeAdaptiveQuestions(
    complaint,
    presentFeatures,
    [],
    external ?? []
  )

  const weighted: WeightedQuestion[] = []
  for (const q of result.questions) {
    const policy = await getPolicy(q.text, state.complaint ?? "unknown")
    const adjustedScore = q.expectedInfoGain * (policy.weight ?? 1.0)
    weighted.push({
      text: q.text,
      expectedInfoGain: q.expectedInfoGain,
      policyWeight: policy.weight,
      adjustedScore,
      targetDiagnoses: q.targetDiagnoses ?? [],
    })
  }

  return weighted.sort((a, b) => b.adjustedScore - a.adjustedScore)
}

export async function recordAnswerAndLearn(
  caseId: string,
  complaint: string,
  question: string,
  stateBefore: any,
  stateAfter: any
): Promise<void> {
  const impact = await recordQuestionImpact(
    caseId,
    complaint,
    question,
    stateBefore,
    stateAfter
  )

  await publishEvent(caseId, "ADAPTIVE_QUESTION_ANSWERED", {
    question,
    entropyBefore: impact.entropyBefore,
    entropyAfter: impact.entropyAfter,
    entropyReduction: impact.entropyReduction,
    diagnosisShifted: impact.diagnosisShifted,
    topDxBefore: impact.topDxBefore,
    topDxAfter: impact.topDxAfter,
  })
}
