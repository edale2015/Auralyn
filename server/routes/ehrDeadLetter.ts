import { Router } from "express"
import { listDeadLetters, resolveDeadLetter, deadLetterStats } from "../services/ehrDeadLetterService"

const router = Router()

router.get("/api/ehr-dead-letter", (req, res) => {
  const includeResolved = req.query.resolved === "true"
  res.json({ ok: true, entries: listDeadLetters(includeResolved), stats: deadLetterStats() })
})

router.get("/api/ehr-dead-letter/stats", (_req, res) => {
  res.json({ ok: true, stats: deadLetterStats() })
})

router.post("/api/ehr-dead-letter/:id/resolve", (req, res) => {
  const ok = resolveDeadLetter(req.params.id)
  if (!ok) return res.status(404).json({ ok: false, error: "Entry not found or already resolved" })
  res.json({ ok: true })
})

export default router
