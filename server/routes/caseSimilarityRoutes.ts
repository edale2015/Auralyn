import { Router } from "express"
import { rebuildCaseSimilarityIndex, indexSingleCase } from "../similarity/caseSimilarityIndex"
import { findSimilarCasesForState } from "../similarity/caseSimilarityService"
import { computeSimilarityWeightedDifferential } from "../similarity/similarityWeightedDifferentialService"
import { rebuildClinicalState } from "../core/state/clinicalStateProjector"
import { recordSimilarityComputed } from "../core/monitoring/metrics"

const router = Router()

router.post("/rebuild-index", async (_req, res) => {
  try {
    const result = await rebuildCaseSimilarityIndex()
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/case/:caseId", async (req, res) => {
  try {
    const state = await rebuildClinicalState(req.params.caseId)
    const result = await findSimilarCasesForState(state, Number(req.query.limit) || 5)
    recordSimilarityComputed()
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/from-state", async (req, res) => {
  try {
    const result = await findSimilarCasesForState(req.body.state, req.body.limit ?? 5)
    recordSimilarityComputed()
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get("/differential/:caseId", async (req, res) => {
  try {
    const state = await rebuildClinicalState(req.params.caseId)
    const result = await computeSimilarityWeightedDifferential(state)
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/differential/from-state", async (req, res) => {
  try {
    const result = await computeSimilarityWeightedDifferential(req.body.state)
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/index-case", async (req, res) => {
  try {
    const { state, outcome } = req.body
    await indexSingleCase(state, outcome)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
