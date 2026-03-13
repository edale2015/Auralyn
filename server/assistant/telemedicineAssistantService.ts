import { getClinicalState } from "../state/clinicalStateStore"
import { publishEvent } from "../core/events/eventPublisher"
import { getUpdatedDifferential } from "./telemedicineDifferentialService"
import { checkSafetyAlerts } from "./telemedicineSafetyService"
import { getMedicationSuggestions } from "./telemedicineMedicationSuggestionService"
import { getReturnPrecautions } from "./telemedicineReturnPrecautionService"
import { getResourceRecommendations } from "../resources/resourceRecommendationEngine"
import { computeUrgencyScore } from "../triage/triagePrioritizationEngine"
import { computeContradictionReport } from "../diagnostics/differentialContradictionEngine"
import { getWeightedAdaptiveQuestions } from "../learning/adaptiveQuestionLearningEngine"

export interface AssistantResult {
  caseId: string
  complaint: string | null
  triage: {
    level: string
    urgencyScore: number
    reason: string
  }
  differential: Array<{
    diagnosis: string
    confidence: number
    urgency: string
  }>
  nextQuestions: string[]
  resources: {
    labs: string[]
    imaging: string[]
    referrals: string[]
    recommendedActions: Array<{ type: string; diagnosis: string; priority: string }>
  }
  contradictions: Array<{ diagnosis: string; conflict: string }>
  safetyAlerts: Array<{ message: string; severity: string }>
  pathway: string | null
}

export async function runTelemedicineAssistant(
  caseId: string,
  incomingMessage?: string
): Promise<AssistantResult> {
  if (incomingMessage) {
    await publishEvent(caseId, "PATIENT_MESSAGE", { message: incomingMessage })
  }

  const state = getClinicalState(caseId)
  const complaint = state.complaint ?? null
  const presentSymptoms = state.presentSymptoms ?? []
  const differential = state.differential ?? []

  const safetyAlerts = checkSafetyAlerts(
    incomingMessage ?? presentSymptoms.join(" "),
    presentSymptoms
  )

  const dxDifferential = complaint
    ? getUpdatedDifferential(complaint, presentSymptoms, incomingMessage ?? "")
    : differential.map((d: any) => ({
        rank: 1,
        diagnosis: d.diagnosis,
        confidence: d.score ?? 0.5,
        keyFeatures: [],
        rulingIn: [],
        rulingOut: [],
        urgency: "routine" as const,
      }))

  const topDx = dxDifferential[0]?.diagnosis ?? null
  const topDxKey = topDx?.toLowerCase().replace(/[\s\/()]/g, "_").replace(/-/g, "_") ?? ""

  const resourceList = topDx
    ? getResourceRecommendations(
        dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence })),
        5
      )
    : []

  const triageCase = {
    caseId,
    complaint: complaint ?? "unknown",
    disposition: state.disposition,
    symptoms: presentSymptoms.join(" "),
    redFlags: safetyAlerts.filter((a) => a.severity === "critical").map((a) => a.message),
    riskScore: dxDifferential[0]?.confidence ?? 0,
    createdAt: new Date().toISOString(),
  }
  const urgencyScore = computeUrgencyScore(triageCase)

  const triageLevel =
    urgencyScore >= 0.85
      ? "critical"
      : urgencyScore >= 0.65
      ? "urgent"
      : urgencyScore >= 0.4
      ? "semi-urgent"
      : "routine"

  const contradictionReport =
    topDx
      ? computeContradictionReport({
          topDiagnosis: topDx,
          differential: dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence })),
          presentSymptoms,
          answeredQuestions: (state.answeredQuestions ?? []).map((q: any) => ({
            questionId: q.questionId ?? q.id ?? "",
            answer: String(q.answer ?? ""),
          })),
        })
      : null

  let nextQuestions: string[] = []
  if (complaint) {
    try {
      const weighted = await getWeightedAdaptiveQuestions(
        complaint,
        presentSymptoms,
        [],
        dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence }))
      )
      nextQuestions = weighted.slice(0, 5).map((q) => q.question.text)
    } catch {
      nextQuestions = []
    }
  }

  const contradictions = (contradictionReport?.contradictions ?? []).map((c) => ({
    diagnosis: topDx ?? "",
    conflict: c.reason,
  }))

  const unruled = (contradictionReport?.unruledDangers ?? []).map((u) => ({
    diagnosis: u.diagnosis,
    conflict: u.rulingOutQuestion,
  }))

  return {
    caseId,
    complaint,
    triage: {
      level: triageLevel,
      urgencyScore,
      reason: safetyAlerts[0]?.message ?? `Urgency score: ${(urgencyScore * 100).toFixed(0)}%`,
    },
    differential: dxDifferential.slice(0, 5).map((d) => ({
      diagnosis: d.diagnosis,
      confidence: d.confidence,
      urgency: d.urgency ?? "routine",
    })),
    nextQuestions,
    resources: {
      labs: resourceList.filter((r) => r.type === "lab").map((r) => r.resource),
      imaging: resourceList.filter((r) => r.type === "imaging").map((r) => r.resource),
      referrals: resourceList.filter((r) => r.type === "referral").map((r) => r.resource),
      recommendedActions: resourceList.map((r) => ({
        type: r.type,
        diagnosis: r.resource,
        priority: r.priority,
      })),
    },
    contradictions: [...contradictions, ...unruled],
    safetyAlerts,
    pathway: complaint ?? null,
  }
}
