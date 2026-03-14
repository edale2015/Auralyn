import { Router } from "express"
import { getAllReminders, suppressReminder, reminderTimelineStats } from "../services/reminderTimelineService"

const router = Router()

router.get("/api/reminder-suppression/candidates", (_req, res) => {
  const pending = getAllReminders().filter((r) => r.status === "pending")

  const candidates = pending.map((r) => {
    const ageMs = Date.now() - new Date(r.scheduledAt).getTime()
    const reasons: string[] = []

    if (ageMs > 24 * 60 * 60 * 1000) reasons.push("Scheduled >24h ago without send")
    if (r.type === "follow_up" && ageMs > 12 * 60 * 60 * 1000) reasons.push("Follow-up overdue >12h")

    return {
      ...r,
      suppressionRecommended: reasons.length > 0,
      suppressionReasons: reasons,
    }
  })

  const recommended = candidates.filter((c) => c.suppressionRecommended)
  res.json({ ok: true, candidates: recommended, stats: reminderTimelineStats() })
})

router.post("/api/reminder-suppression/auto-suppress", (req, res) => {
  const { reason } = req.body
  const pending = getAllReminders().filter((r) => r.status === "pending")
  let suppressed = 0

  for (const r of pending) {
    const ageMs = Date.now() - new Date(r.scheduledAt).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) {
      const ok = suppressReminder(r.id, reason ?? "Auto-suppressed: overdue >24h")
      if (ok) suppressed++
    }
  }

  res.json({ ok: true, suppressed })
})

router.post("/api/reminder-suppression/:id", (req, res) => {
  const ok = suppressReminder(req.params.id, req.body.reason ?? "Manual suppression via UI")
  if (!ok) return res.status(404).json({ ok: false, error: "Not found or not pending" })
  res.json({ ok: true })
})

export default router
