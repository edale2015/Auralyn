import { Router } from "express"
import {
  scheduleReminder,
  getTimelineForCase,
  getAllReminders,
  suppressReminder,
  markReminderSent,
  reminderTimelineStats,
} from "../services/reminderTimelineService"

const router = Router()

router.get("/api/reminders", (_req, res) => {
  res.json({ ok: true, reminders: getAllReminders(), stats: reminderTimelineStats() })
})

router.get("/api/reminders/stats", (_req, res) => {
  res.json({ ok: true, stats: reminderTimelineStats() })
})

router.get("/api/reminders/:caseId", (req, res) => {
  res.json({ ok: true, timeline: getTimelineForCase(req.params.caseId) })
})

router.post("/api/reminders", (req, res) => {
  const { caseId, type, scheduledAt, channel, patientId } = req.body
  if (!caseId || !type || !scheduledAt || !channel) {
    return res.status(400).json({ ok: false, error: "caseId, type, scheduledAt, channel required" })
  }
  const r = scheduleReminder(caseId, type, scheduledAt, channel, patientId)
  res.json({ ok: true, reminder: r })
})

router.post("/api/reminders/:id/suppress", (req, res) => {
  const ok = suppressReminder(req.params.id, req.body.reason ?? "Manual suppression")
  if (!ok) return res.status(404).json({ ok: false, error: "Reminder not found or not pending" })
  res.json({ ok: true })
})

router.post("/api/reminders/:id/sent", (req, res) => {
  const ok = markReminderSent(req.params.id)
  if (!ok) return res.status(404).json({ ok: false, error: "Reminder not found" })
  res.json({ ok: true })
})

export default router
