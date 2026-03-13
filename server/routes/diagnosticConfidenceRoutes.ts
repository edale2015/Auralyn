import express from "express"
import { rebuildClinicalState } from "../core/state/clinicalStateProjector"
import { computeDiagnosticConfidence } from "../diagnostics/diagnosticConfidenceService"

const router = express.Router()

router.get("/api/diagnostics/confidence/:caseId", async (req, res) => {
  try {
    const state = await rebuildClinicalState(req.params.caseId)
    const result = computeDiagnosticConfidence(state)
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/api/diagnostics/confidence/from-state", async (req, res) => {
  try {
    const state = req.body.state ?? req.body
    const result = computeDiagnosticConfidence(state)
    res.json({ ok: true, result })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
