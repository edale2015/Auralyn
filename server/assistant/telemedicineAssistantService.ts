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

import { mapTelemedToAgents, runAgentDebate } from "./telemedAgentAdapter"
import { shouldTriggerRequery } from "./requeryPolicy"
import { chooseNextBestQuestion } from "./nextBestQuestionEngine"
import { logCaseMemory, getCaseMemory, getLastMemory } from "./caseMemoryService"
import { buildEscalationBundle } from "./escalationService"
import { routeToSpecialtyCouncil } from "./specialtyRouter"
import { computeCounterfactuals } from "../reasoning/counterfactualEngine"
import { predictTrajectory } from "../reasoning/trajectoryEngine"
import { runBayesianUpdate, buildEvidenceFromResult } from "../reasoning/bayesianEngine"
import { runDigitalTwin } from "../simulation/digitalTwinEngine"
import { runQA } from "../qa/qaAgent"
import { logQA } from "../qa/qaLogService"
import { runMetaLearning } from "../learning/metaLearningEngine"
import { publishCognitive } from "../missionControl/cognitiveBus"
import { updateCommandGridNode } from "../hospital/commandGrid"
import { runIntervention } from "../agents/interventionAgent"
import { logPopulationCase } from "../populationHealth/populationEngine"

export interface AssistantResult {
  caseId: string
  complaint: string | null
  iteration: number
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
  uncertainty: number
  debate: {
    winner: { agentId: string; conclusion: string; confidence: number } | null
    consensusScore: number
    disagreement: number
    opinions: Array<{ agentId: string; domain: string; conclusion: string; confidence: number; reasoning: string }>
  }
  requery: {
    shouldRequery: boolean
    reason: string
    questionAsked: string | null
  }
  counterfactuals: {
    keyFactors: Array<{ variable: string; current: string; alternative: string; effect: string; impactScore: number }>
    summary: string
  }
  trajectory: {
    trend: string
    riskScore: number
    timeHorizon: string
    drivers: string[]
    escalationProbability: number
  }
  bayesian: Array<{ diagnosis: string; prior: number; posterior: number; delta: number }>
  simulation: Array<{
    scenario: string
    intervention: string
    riskScore: number
    outcome: string
    timeToEvent: string
    recommendation: string
  }>
  qa: {
    score: number
    flags: Array<{ type: string; severity: string; message: string }>
  }
  specialty: {
    primary: string
    secondary: string | null
    confidence: number
    reason: string
  }
  escalation: {
    priority: "urgent" | "emergency"
    reason: string
    topConcerns: string[]
    recommendedActions: string[]
  } | null
  intervention: {
    action: string
    urgency: string
    message: string
    channels: string[]
  }
  systemThresholds: {
    escalationThreshold: number
    uncertaintyThreshold: number
    requeryThreshold: number
    safetyBoostFactor: number
  }
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

  const memory = getCaseMemory(caseId)
  const lastMemory = getLastMemory(caseId)
  const iteration = (lastMemory?.iteration ?? 0) + 1

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
      ? "emergency"
      : urgencyScore >= 0.75
      ? "critical"
      : urgencyScore >= 0.60
      ? "urgent"
      : urgencyScore >= 0.40
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

  let adaptiveQuestions: any[] = []
  if (complaint) {
    try {
      const weighted = await getWeightedAdaptiveQuestions(
        complaint,
        presentSymptoms,
        [],
        dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence }))
      )
      adaptiveQuestions = weighted.slice(0, 5)
    } catch {
      adaptiveQuestions = []
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

  const baseResult = {
    caseId,
    complaint,
    safetyAlerts,
    triage: { level: triageLevel, urgencyScore, reason: safetyAlerts[0]?.message ?? `Urgency score: ${(urgencyScore * 100).toFixed(0)}%` },
    differential: dxDifferential.slice(0, 5).map((d) => ({
      diagnosis: d.diagnosis,
      confidence: d.confidence,
      urgency: (d.urgency ?? "routine") as string,
    })),
  }

  const confidences = dxDifferential.slice(0, 3).map(d => d.confidence)
  const confMean = confidences.length ? confidences.reduce((s, c) => s + c, 0) / confidences.length : 0.5
  const confVariance = confidences.length
    ? confidences.reduce((s, c) => s + Math.pow(c - confMean, 2), 0) / confidences.length
    : 0.25
  let uncertainty = Math.sqrt(confVariance) + (1 - confMean) * 0.4
  if (safetyAlerts.length > 0) uncertainty = Math.max(uncertainty, 0.72)
  uncertainty = Math.min(1, Math.max(0, Math.round(uncertainty * 1000) / 1000))

  const agentOpinions = mapTelemedToAgents({ ...baseResult, uncertainty })
  const debate = runAgentDebate(agentOpinions)

  const systemThresholds = runMetaLearning()

  const requeryDecision = shouldTriggerRequery({
    uncertainty,
    debate: { consensusScore: debate.consensusScore, disagreement: debate.disagreement },
    subServiceFailures: [],
    safetyAlerts,
  })

  const nbqResult = chooseNextBestQuestion({
    adaptiveQuestions: adaptiveQuestions.map((q, idx) => ({
      id: `q-${idx}`,
      text: q.question?.text ?? q.text ?? String(q),
      blockingRisk: q.blockingRisk ?? false,
    })),
    uncertainty,
    debate: { disagreement: debate.disagreement, consensusScore: debate.consensusScore },
  })

  const nextQuestions = requeryDecision.shouldRequery && nbqResult.winner
    ? [nbqResult.winner.text, ...adaptiveQuestions.slice(0, 4).map((q: any) => q.question?.text ?? q.text ?? String(q)).filter((t: string) => t !== nbqResult.winner!.text)]
    : adaptiveQuestions.slice(0, 5).map((q: any) => q.question?.text ?? q.text ?? String(q))

  const enrichedResult = { ...baseResult, uncertainty, debate, requery: requeryDecision }

  const trajectory = predictTrajectory(enrichedResult, memory)
  const counterfactuals = computeCounterfactuals(enrichedResult)

  const priors = dxDifferential.slice(0, 4).map(d => ({ diagnosis: d.diagnosis, prior: d.confidence }))
  const evidence = buildEvidenceFromResult(baseResult)
  const bayesian = runBayesianUpdate({ priors, evidence })

  const simulation = runDigitalTwin({ result: { ...enrichedResult, trajectory } })

  const specialty = routeToSpecialtyCouncil(complaint ?? "", dxDifferential)

  const fullResult: any = {
    ...enrichedResult,
    trajectory,
    counterfactuals,
    bayesian,
    simulation,
    specialty,
    iteration,
  }

  const qa = runQA(fullResult)
  logQA(qa)

  const escalation = buildEscalationBundle({
    result: fullResult,
    requery: requeryDecision.shouldRequery ? { questionAsked: nbqResult.winner?.text } : undefined,
  })

  const intervention = runIntervention(fullResult)

  logCaseMemory({
    caseId,
    iteration,
    triage: triageLevel,
    urgencyScore,
    uncertainty,
    topDiagnosis: topDx ?? "unknown",
    winnerAgent: debate.winner?.agentId ?? "none",
    questionAsked: nbqResult.winner?.text,
    changedFromPrior: lastMemory ? lastMemory.triage !== triageLevel : false,
  })

  updateCommandGridNode({
    caseId,
    complaint: complaint ?? "unknown",
    triageLevel,
    riskScore: trajectory.riskScore,
    trajectory: trajectory.trend,
    escalation: escalation?.priority ?? null,
    iteration,
  })

  if (complaint) {
    logPopulationCase({
      caseId,
      complaint,
      diagnosis: topDx ?? "unknown",
      severity:
        triageLevel === "emergency" || triageLevel === "critical" ? "critical" :
        triageLevel === "urgent" ? "high" :
        triageLevel === "semi-urgent" ? "medium" : "low",
      zip: (state as any).zip ?? undefined,
      payer: (state as any).payer ?? undefined,
      ageGroup: (state as any).ageGroup ?? undefined,
    })
  }

  publishCognitive({
    topic: "telemed_cognition",
    caseId,
    payload: {
      iteration,
      triage: triageLevel,
      urgencyScore,
      uncertainty,
      trajectory: trajectory.trend,
      riskScore: trajectory.riskScore,
      escalationPriority: escalation?.priority ?? null,
      interventionAction: intervention.action,
      qaScore: qa.score,
      qaFlags: qa.flags.length,
      winnerAgent: debate.winner?.agentId,
      consensusScore: debate.consensusScore,
      specialty: specialty.primary,
    },
    ts: Date.now(),
  })

  if (escalation) {
    publishCognitive({ topic: "escalation", caseId, payload: escalation, ts: Date.now() })
  }

  if (qa.flags.some(f => f.severity === "high")) {
    publishCognitive({ topic: "qa_event", caseId, payload: qa, ts: Date.now() })
  }

  return {
    caseId,
    complaint,
    iteration,
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
    uncertainty,
    debate: {
      winner: debate.winner ? {
        agentId: debate.winner.agentId,
        conclusion: debate.winner.conclusion,
        confidence: debate.winner.confidence,
      } : null,
      consensusScore: debate.consensusScore,
      disagreement: debate.disagreement,
      opinions: debate.opinions.map(o => ({
        agentId: o.agentId,
        domain: o.domain,
        conclusion: o.conclusion,
        confidence: o.confidence,
        reasoning: o.reasoning,
      })),
    },
    requery: {
      shouldRequery: requeryDecision.shouldRequery,
      reason: requeryDecision.reason,
      questionAsked: requeryDecision.shouldRequery ? (nbqResult.winner?.text ?? null) : null,
    },
    counterfactuals,
    trajectory,
    bayesian,
    simulation,
    qa: { score: qa.score, flags: qa.flags },
    specialty,
    escalation: escalation ? {
      priority: escalation.priority,
      reason: escalation.reason,
      topConcerns: escalation.topConcerns,
      recommendedActions: escalation.recommendedActions,
    } : null,
    intervention,
    systemThresholds,
  }
}
