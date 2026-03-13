import express from "express"
import { rebuildClinicalState } from "../core/state/clinicalStateProjector"
import { getWeightedAdaptiveQuestions, recordAnswerAndLearn } from "../learning/adaptiveQuestionLearningEngine"
import { trainQuestionWeights } from "../learning/questionWeightTrainer"
import { loadPolicies, loadImpacts } from "../learning/questionPolicyStore"

const router = express.Router()

router.get("/api/aqle/questions/:caseId", async (req, res) => {
  try {
    const state = await rebuildClinicalState(req.params.caseId)
    const questions = await getWeightedAdaptiveQuestions(state, state.differential)
    res.json({ ok: true, complaint: state.complaint, questions })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/api/aqle/questions/from-state", async (req, res) => {
  try {
    const { state, external } = req.body
    const questions = await getWeightedAdaptiveQuestions(state ?? req.body, external)
    res.json({ ok: true, complaint: state?.complaint, questions })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/api/aqle/record-answer", async (req, res) => {
  try {
    const { caseId, complaint, question, stateBefore, stateAfter } = req.body
    if (!caseId || !question || !stateBefore || !stateAfter) {
      return res.status(400).json({ ok: false, error: "caseId, question, stateBefore, stateAfter required" })
    }
    await recordAnswerAndLearn(caseId, complaint ?? "unknown", question, stateBefore, stateAfter)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/api/aqle/train", async (req, res) => {
  try {
    const { complaint } = req.body
    const results = await trainQuestionWeights(complaint)
    res.json({ ok: true, results, count: results.length })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/aqle/policies", async (_req, res) => {
  try {
    const policies = await loadPolicies()
    res.json({ ok: true, policies, count: policies.length })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/api/aqle/impacts", async (_req, res) => {
  try {
    const impacts = await loadImpacts()
    res.json({ ok: true, impacts: impacts.slice(-50), total: impacts.length })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
