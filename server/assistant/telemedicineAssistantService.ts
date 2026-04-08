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
import { runClinicalFusion } from "./clinicalFusionEngine"
import { computeUncertainty } from "./uncertaintyEngine"
import { applySafetyGovernor } from "./safetyGovernor"
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
import { explainWinner } from "./shapExplainer"
import { recordDebateRound, getAgentPerformance } from "./agentPerformanceTracker"
import { logShap } from "./shapLogService"
import { timeEngineSync, timeEngine, getEngineReliability } from "./telemedEngineReliability"

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
  fusion: {
    finalPriority: string
    dominantSignal: string
    reasoningSummary: string
    conflictsDetected: string[]
    reinforcingSignals: string[]
    overrideApplied: boolean
  }
  uncertaintyLevel: string
  uncertaintyDrivers: string[]
  safetyGovernorOverride: boolean
  safetyGovernorReason: string | null
  explanation: {
    winner: string
    winnerDomain: string
    baseScore: number
    finalScore: number
    factors: Array<{
      name: string
      contribution: number
      direction: "for" | "against" | "neutral"
      description: string
      weight: number
    }>
    narrative: string
  }
  nextBestQuestions: Array<{
    id: string
    text: string
    infoGain: number
    target: string
  }>
  temporalHistory: Array<{
    iteration: number
    triage: string
    urgencyScore: number
    uncertainty: number
    topDiagnosis: string
    winnerAgent: string
    changedFromPrior: boolean
    timestamp: number
  }>
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

  const safetyAlerts = timeEngineSync("safety_alerts", () =>
    checkSafetyAlerts(
      incomingMessage ?? presentSymptoms.join(" "),
      presentSymptoms
    )
  )

  const dxDifferential = complaint
    ? timeEngineSync("differential", () =>
        getUpdatedDifferential(complaint, presentSymptoms, incomingMessage ?? "")
      )
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
    ? timeEngineSync("resources", () =>
        getResourceRecommendations(
          dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence })),
          5
        )
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
  const urgencyScore = timeEngineSync("triage_urgency", () => computeUrgencyScore(triageCase))

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
      ? timeEngineSync("contradiction", () =>
          computeContradictionReport({
            topDiagnosis: topDx,
            differential: dxDifferential.map((d) => ({ diagnosis: d.diagnosis, score: d.confidence })),
            presentSymptoms,
            answeredQuestions: (state.answeredQuestions ?? []).map((q: any) => ({
              questionId: q.questionId ?? q.id ?? "",
              answer: String(q.answer ?? ""),
            })),
          })
        )
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

  const contradictionsForUncertainty = [
    ...(contradictionReport?.contradictions ?? []).map((c) => ({ diagnosis: topDx ?? "", conflict: c.reason })),
    ...(contradictionReport?.unruledDangers ?? []).map((u) => ({ diagnosis: u.diagnosis, conflict: u.rulingOutQuestion })),
  ]

  const uncertaintyResult = timeEngineSync("uncertainty", () =>
    computeUncertainty({
      subServiceFailures: [],
      differential: dxDifferential.slice(0, 5).map(d => ({ diagnosis: d.diagnosis, confidence: d.confidence })),
      safetyAlerts,
      contradictions: contradictionsForUncertainty,
    })
  )
  const uncertainty = uncertaintyResult.score

  const agentOpinions = mapTelemedToAgents({ ...baseResult, uncertainty })
  const debate = timeEngineSync("agent_debate", () => runAgentDebate(agentOpinions))

  const fusion = timeEngineSync("clinical_fusion", () =>
    runClinicalFusion({
      differential: dxDifferential.slice(0, 5).map(d => ({ diagnosis: d.diagnosis, confidence: d.confidence, urgency: d.urgency ?? "routine" })),
      safetyAlerts,
      urgency: { level: triageLevel, score: urgencyScore },
      contradictions: contradictionsForUncertainty,
      debateWinner: debate.winner,
      uncertainty,
    })
  )

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

  const trajectory = timeEngineSync("trajectory", () => predictTrajectory(enrichedResult, memory))
  const counterfactuals = timeEngineSync("counterfactuals", () => computeCounterfactuals(enrichedResult))

  const priors = dxDifferential.slice(0, 4).map(d => ({ diagnosis: d.diagnosis, prior: d.confidence }))
  const evidence = buildEvidenceFromResult(baseResult)
  const bayesian = timeEngineSync("bayesian", () => runBayesianUpdate({ priors, evidence }))

  const simulation = timeEngineSync("digital_twin", () => runDigitalTwin({ result: { ...enrichedResult, trajectory } }))

  const specialty = timeEngineSync("specialty_router", () => routeToSpecialtyCouncil(complaint ?? "", dxDifferential))

  const preGovernorResult = {
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
    specialty,
    systemThresholds,
  }

  const governed = timeEngineSync("safety_governor", () => applySafetyGovernor(preGovernorResult))

  const debateWinnerId = governed.overrideApplied
    ? (agentOpinions.find(o => o.domain === "safety")?.agentId ?? "safety_engine")
    : (debate.winner?.agentId ?? "none")
  recordDebateRound(
    agentOpinions.map(o => ({ agentId: o.agentId, domain: o.domain })),
    debateWinnerId
  )

  const escalation = timeEngineSync("escalation", () =>
    buildEscalationBundle({
      result: governed.result,
      requery: requeryDecision.shouldRequery ? { questionAsked: nbqResult.winner?.text } : undefined,
    })
  )

  const intervention = timeEngineSync("intervention", () => runIntervention(governed.result))

  const qa = timeEngineSync("qa_agent", () => runQA({ ...governed.result, escalation }))
  logQA(qa)

  logCaseMemory({
    caseId,
    iteration,
    triage: governed.result.triage.level,
    urgencyScore,
    uncertainty,
    topDiagnosis: topDx ?? "unknown",
    winnerAgent: debate.winner?.agentId ?? "none",
    questionAsked: nbqResult.winner?.text,
    changedFromPrior: lastMemory ? lastMemory.triage !== governed.result.triage.level : false,
  })

  updateCommandGridNode({
    caseId,
    complaint: complaint ?? "unknown",
    triageLevel: governed.result.triage.level,
    riskScore: trajectory.riskScore,
    trajectory: trajectory.trend,
    escalation: escalation?.priority ?? null,
    iteration,
  })

  if (complaint) {
    const govLevel = governed.result.triage.level
    logPopulationCase({
      caseId,
      complaint,
      diagnosis: topDx ?? "unknown",
      severity:
        govLevel === "emergency" || govLevel === "critical" ? "critical" :
        govLevel === "urgent" ? "high" :
        govLevel === "semi-urgent" ? "medium" : "low",
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
      triage: governed.result.triage.level,
      urgencyScore: governed.result.triage.urgencyScore,
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
      safetyGovernorOverride: governed.overrideApplied,
      fusionPriority: fusion.finalPriority,
    },
    ts: Date.now(),
  })

  if (escalation) {
    publishCognitive({ topic: "escalation", caseId, payload: escalation, ts: Date.now() })
  }

  if (qa.flags.some((f: any) => f.severity === "high")) {
    publishCognitive({ topic: "qa_event", caseId, payload: qa, ts: Date.now() })
  }

  const explanation = explainWinner({
    debateWinner: debate.winner ? {
      agentId: debate.winner.agentId,
      conclusion: debate.winner.conclusion,
      confidence: debate.winner.confidence,
    } : null,
    opinions: debate.opinions.map(o => ({
      agentId: o.agentId,
      domain: o.domain,
      conclusion: o.conclusion,
      confidence: o.confidence,
      reasoning: o.reasoning,
    })),
    safetyAlerts,
    uncertainty,
    fusion,
    escalation: escalation ? { priority: escalation.priority } : null,
    safetyGovernorOverride: governed.overrideApplied,
  })

  logShap({
    caseId,
    iteration,
    ts: Date.now(),
    explanation,
    triage: governed.result.triage.level,
    safetyGovernorOverride: governed.overrideApplied,
  })

  const nextBestQuestions = nbqResult.ranked.slice(0, 3).map(q => ({
    id: q.id,
    text: q.text,
    infoGain: q.infoGain,
    target: q.target,
  }))

  const temporalHistory = getCaseMemory(caseId).map(m => ({
    iteration: m.iteration,
    triage: m.triage,
    urgencyScore: m.urgencyScore,
    uncertainty: m.uncertainty,
    topDiagnosis: m.topDiagnosis,
    winnerAgent: m.winnerAgent,
    changedFromPrior: m.changedFromPrior,
    timestamp: m.timestamp,
  }))

  return {
    ...governed.result,
    qa: { score: qa.score, flags: qa.flags },
    escalation: escalation ? {
      priority: escalation.priority,
      reason: escalation.reason,
      topConcerns: escalation.topConcerns,
      recommendedActions: escalation.recommendedActions,
    } : null,
    intervention,
    fusion,
    uncertaintyLevel: uncertaintyResult.level,
    uncertaintyDrivers: uncertaintyResult.drivers,
    safetyGovernorOverride: governed.overrideApplied,
    safetyGovernorReason: governed.overrideReason,
    explanation,
    nextBestQuestions,
    temporalHistory,
  }
}
