import { Router } from "express"
import { buildBulkPreview } from "../services/bulkActionPreviewService"

const router = Router()

const sentJobs: {
  id: string
  action: string
  targets: number
  sent: number
  failed: number
  startedAt: string
  completedAt?: string
}[] = []

router.post("/api/bulk-messaging/send", async (req, res) => {
  const { targets, message, channel, dryRun } = req.body
  if (!Array.isArray(targets) || !message) {
    return res.status(400).json({ ok: false, error: "targets[] and message required" })
  }

  const preview = buildBulkPreview(targets, "send_message", message)
  if (preview.blocked > 0 && !dryRun) {
    return res.status(400).json({ ok: false, error: `${preview.blocked} targets are blocked`, preview })
  }

  if (dryRun) {
    return res.json({ ok: true, dryRun: true, preview })
  }

  const job = {
    id: `bulk_${Date.now()}`,
    action: "send_message",
    targets: targets.length,
    sent: targets.length - preview.blocked,
    failed: preview.blocked,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }
  sentJobs.push(job)
  res.json({ ok: true, job })
})

router.get("/api/bulk-messaging/jobs", (_req, res) => {
  res.json({ ok: true, jobs: [...sentJobs].reverse() })
})

export default router
