import { Router } from "express"
import { retryDeadLetterEntry, retryAllDeadLetters } from "../services/ehrRetryService"

const router = Router()

router.post("/api/ehr-retry/:id", async (req, res) => {
  try {
    const result = await retryDeadLetterEntry(req.params.id)
    res.json({ ok: result.ok, result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.post("/api/ehr-retry/all", async (_req, res) => {
  try {
    const results = await retryAllDeadLetters()
    const ok = results.every((r) => r.ok)
    res.json({ ok, results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
