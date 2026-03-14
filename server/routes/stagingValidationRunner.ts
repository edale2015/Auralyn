import { Router } from "express"
import { startValidationRun, listValidationRuns, getLatestRun } from "../services/stagingValidationRunnerService"

const router = Router()

router.post("/api/staging-validation/run", async (_req, res) => {
  try {
    const run = await startValidationRun()
    res.json({ ok: true, run })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get("/api/staging-validation/runs", (_req, res) => {
  res.json({ ok: true, runs: listValidationRuns() })
})

router.get("/api/staging-validation/latest", (_req, res) => {
  const run = getLatestRun()
  if (!run) return res.json({ ok: true, run: null, message: "No runs yet" })
  res.json({ ok: true, run })
})

export default router
