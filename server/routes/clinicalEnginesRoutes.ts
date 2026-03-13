import express from "express"
import { getClinicalState } from "../state/clinicalStateStore"
import { rebuildClinicalState } from "../core/state/clinicalStateProjector"

import { analyzeTemporalProgression, getTemporalDiagnosticAdjustments } from "../temporal/temporalSymptomEngine"
import { computePatientRiskProfile, adjustDifferentialForRisk } from "../risk/patientRiskProfileEngine"
import { buildClinicalTimeline, getTimelineStats } from "../timeline/clinicalTimelineEngine"
import { generateEpidemiologyReport, detectOutbreak } from "../epidemiology/epidemiologyEngine"
import { getResourceRecommendations } from "../resources/resourceRecommendationEngine"
import { prioritizeCases, computeUrgencyScore } from "../triage/triagePrioritizationEngine"
import { findOutcomeReinforcedCases, getDiagnosisDistributionFromSimilarCases } from "../similarity/reinforcedSimilarityService"
import { recordCaseOutcome } from "../learning/caseOutcomeRecorder"
import { recordPhysicianFeedback, loadPhysicianFeedback, getPhysicianFeedbackStats } from "../learning/physicianFeedbackEngine"
import { trainOutcomeModel, getAdjustedPriors } from "../learning/outcomeReinforcementTrainer"
import { getTopReinforcedQuestions, reinforceQuestionWeights } from "../learning/questionReinforcementEngine"
import { estimateDispositionRisk } from "../diagnostics/dispositionRiskEngine"
import { graphReasoning, getEvidenceForDiagnosis } from "../diagnostics/clinicalEvidenceGraph"
import { computeDiagnosticConsensus, buildConsensusSources } from "../diagnostics/diagnosticConsensusEngine"
import { calibrateWithOutcomes } from "../diagnostics/confidenceCalibrationEngine"
import { calibrateDifferential } from "../diagnostics/differentialCalibrationEngine"
import { rebuildSimilarityIndexFromOutcomes } from "../similarity/caseMemoryIndexer"
import { getOutcomeStats } from "../similarity/outcomeCaseMemory"
import { computeContradictionReport } from "../diagnostics/differentialContradictionEngine"

const router = express.Router()

// ─── Temporal Symptom Progression ─────────────────────────────────────────
router.get("/api/clinical/temporal/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const events = state.events ?? []
    const temporal = analyzeTemporalProgression(events)
    const adjustments = getTemporalDiagnosticAdjustments(temporal)
    res.json({ ok: true, temporal, diagnosticAdjustments: adjustments })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Patient Risk Profile ──────────────────────────────────────────────────
router.get("/api/clinical/risk-profile/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const riskProfile = computePatientRiskProfile(state.patient ?? {})
    const adjustedDiff = state.differential?.length
      ? adjustDifferentialForRisk(state.differential, riskProfile)
      : []
    res.json({ ok: true, riskProfile, adjustedDifferential: adjustedDiff })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Clinical Timeline ─────────────────────────────────────────────────────
router.get("/api/clinical/timeline/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const events = state.events ?? []
    const timeline = buildClinicalTimeline(events)
    const stats = getTimelineStats(events)
    res.json({ ok: true, timeline, stats })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Disposition Risk ──────────────────────────────────────────────────────
router.get("/api/clinical/disposition-risk/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const riskProfile = computePatientRiskProfile(state.patient ?? {})
    const risk = estimateDispositionRisk(
      state.differential ?? [],
      {
        ageRisk: riskProfile.ageRisk,
        cardiovascularRisk: riskProfile.cardiovascularRisk,
        respiratoryRisk: riskProfile.respiratoryRisk,
      }
    )
    res.json({ ok: true, risk })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Evidence Graph Reasoning ──────────────────────────────────────────────
router.post("/api/clinical/evidence-graph", async (req, res) => {
  try {
    const { symptoms, caseId, diagnosis } = req.body
    const text = symptoms ?? (caseId ? getClinicalState(caseId).symptoms : "")
    const graphResults = graphReasoning(text ?? "")

    let evidenceFor: any = undefined
    if (diagnosis) {
      evidenceFor = getEvidenceForDiagnosis(diagnosis, text ?? "")
    }

    res.json({ ok: true, graphResults, evidenceFor })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Diagnostic Consensus ──────────────────────────────────────────────────
router.get("/api/clinical/consensus/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const symptoms = state.symptoms ?? ""
    const differential = state.differential ?? []

    const graphResults = graphReasoning(symptoms)
    const similarDist = await getDiagnosisDistributionFromSimilarCases(state)

    const sources = buildConsensusSources(differential, graphResults, similarDist, [])
    const consensus = computeDiagnosticConsensus(sources)

    res.json({ ok: true, consensus: consensus.slice(0, 8), sources: sources.map((s) => s.name) })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Resource Recommendations ──────────────────────────────────────────────
router.get("/api/clinical/resources/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const topN = parseInt(req.query.topN as string) || 3
    const resources = getResourceRecommendations(state.differential ?? [], topN)
    res.json({ ok: true, resources })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Reinforced Similar Cases ──────────────────────────────────────────────
router.get("/api/clinical/similar-reinforced/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const limit = parseInt(req.query.limit as string) || 10
    const matches = await findOutcomeReinforcedCases(state, limit)
    const distribution = await getDiagnosisDistributionFromSimilarCases(state, limit)
    res.json({ ok: true, matches, distribution })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Calibrated Confidence ─────────────────────────────────────────────────
router.get("/api/clinical/calibrated-confidence/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const differential = (state.differential ?? []).map((d: any) => ({
      diagnosis: typeof d === "string" ? d : d.diagnosis,
      score: typeof d === "string" ? 0.25 : d.score ?? d.confidence ?? 0.25,
    }))
    const calibrated = await calibrateWithOutcomes(differential)
    res.json({ ok: true, calibrated })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Epidemiology ──────────────────────────────────────────────────────────
router.get("/api/clinical/epidemiology", async (req, res) => {
  try {
    const windowDays = parseInt(req.query.days as string) || 7
    const report = await generateEpidemiologyReport(windowDays)
    const outbreak = detectOutbreak(report.trends)
    res.json({ ok: true, report, outbreak })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Triage Prioritization ────────────────────────────────────────────────
router.post("/api/clinical/triage-prioritize", async (req, res) => {
  try {
    const { cases } = req.body
    if (!Array.isArray(cases)) {
      return res.status(400).json({ ok: false, error: "cases array required" })
    }
    const prioritized = prioritizeCases(cases)
    res.json({ ok: true, prioritized })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/clinical/urgency/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const triageCase = {
      caseId: req.params.caseId,
      complaint: state.complaint ?? "unknown",
      disposition: state.disposition,
      symptoms: state.symptoms,
      redFlags: (state as any).alerts ?? [],
      createdAt: state.createdAt ?? new Date().toISOString(),
    }
    const urgencyScore = computeUrgencyScore(triageCase)
    res.json({ ok: true, urgencyScore, case: triageCase })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Case Outcome Recording ────────────────────────────────────────────────
router.post("/api/clinical/outcomes", async (req, res) => {
  try {
    const { caseId, actualDiagnosis, dispositionMatch, safetyMiss, physicianCorrection, questionsAsked } = req.body
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" })
    await recordCaseOutcome({ caseId, actualDiagnosis, dispositionMatch, safetyMiss, physicianCorrection, questionsAsked })
    res.json({ ok: true, recorded: true })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/clinical/outcomes/stats", async (req, res) => {
  try {
    const stats = await getOutcomeStats()
    res.json({ ok: true, stats })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Physician Feedback ────────────────────────────────────────────────────
router.post("/api/clinical/physician-feedback", async (req, res) => {
  try {
    const { caseId, systemDiagnosis, systemDisposition, correctedDiagnosis, correctedDisposition, physicianNote, approved } = req.body
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" })
    await recordPhysicianFeedback({ caseId, systemDiagnosis, systemDisposition, correctedDiagnosis, correctedDisposition, physicianNote, approved: approved ?? true })
    res.json({ ok: true, recorded: true })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/clinical/physician-feedback", async (req, res) => {
  try {
    const { limit } = req.query
    const all = await loadPhysicianFeedback()
    const rows = limit ? all.slice(-parseInt(limit as string)) : all
    res.json({ ok: true, rows, total: all.length })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/clinical/physician-feedback/stats", async (req, res) => {
  try {
    const stats = await getPhysicianFeedbackStats()
    res.json({ ok: true, stats })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Outcome Reinforcement Training ───────────────────────────────────────
router.post("/api/clinical/train-outcomes", async (req, res) => {
  try {
    const model = await trainOutcomeModel()
    const adjustedPriors = await getAdjustedPriors()
    res.json({ ok: true, model, adjustedPriors, diagnosisCount: Object.keys(model).length })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Question Reinforcement ────────────────────────────────────────────────
router.post("/api/clinical/reinforce-questions", async (req, res) => {
  try {
    const { questionsAsked, complaint, correctDiagnosis, entropyReduction } = req.body
    await reinforceQuestionWeights({ questionsAsked, complaint, correctDiagnosis, entropyReduction })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/clinical/top-questions/:complaint", async (req, res) => {
  try {
    const questions = await getTopReinforcedQuestions(req.params.complaint, 10)
    res.json({ ok: true, questions })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Case Memory Index Rebuild ─────────────────────────────────────────────
router.post("/api/clinical/rebuild-memory-index", async (req, res) => {
  try {
    const count = await rebuildSimilarityIndexFromOutcomes()
    res.json({ ok: true, count, message: `Rebuilt index with ${count} outcome cases` })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Differential Contradiction / Missing Evidence ─────────────────────────
router.get("/api/clinical/contradiction/:caseId", async (req, res) => {
  try {
    const state = getClinicalState(req.params.caseId)
    const differential = state.differential ?? []
    const presentSymptoms = state.presentSymptoms ?? []
    const answeredQuestions = state.answeredQuestions ?? []
    const topDiagnosis =
      differential[0]?.diagnosis ??
      state._meta?.diagnosticConfidence?.[0]?.diagnosis ??
      "unknown"

    if (topDiagnosis === "unknown") {
      return res.json({ ok: true, report: null, message: "No top diagnosis yet" })
    }

    const report = computeContradictionReport({
      topDiagnosis,
      differential,
      presentSymptoms,
      answeredQuestions: answeredQuestions.map((q: any) => ({
        questionId: q.questionId ?? q.id ?? "",
        answer: String(q.answer ?? ""),
      })),
    })

    res.json({ ok: true, report })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
