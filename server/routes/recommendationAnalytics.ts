import { Router } from "express"
import { getRecommendationSummary, recordTemplateUsage } from "../services/recommendationAnalyticsService"

const router = Router()

router.get("/api/recommendation-analytics/summary", (_req, res) => {
  res.json({ ok: true, summary: getRecommendationSummary() })
})

router.post("/api/recommendation-analytics/record", (req, res) => {
  const { templateId, label, category, complaint, accepted, editDistance } = req.body
  if (!templateId || !label || !category) {
    return res.status(400).json({ ok: false, error: "templateId, label, and category are required" })
  }
  recordTemplateUsage(templateId, label, category, complaint ?? "general", !!accepted, editDistance ?? 0)
  res.json({ ok: true })
})

export default router
