// INDEPENDENT REVIEW FIX:
//   POST /api/bulk-messaging/send allowed unauthenticated clients to trigger bulk SMS
//   to patient phone numbers — a serious abuse vector (spam, patient harassment, cost).
//   GET /jobs also exposed sent job metadata without auth.
//   Added requireRole() to both endpoints; write action scoped to physician/admin only.
//   Added try/catch to the async POST handler — an unhandled rejection crashes Express.

import { Router } from "express"
import { requireRole } from "../middleware/requireRole"
import { buildBulkPreview } from "../services/bulkActionPreviewService"

const router = Router()

const requirePhysician = requireRole(["admin", "physician"])
const requireStaff     = requireRole(["admin", "physician", "nurse", "staff"])

const sentJobs: {
  id: string
  action: string
  targets: number
  sent: number
  failed: number
  startedAt: string
  completedAt?: string
}[] = []

router.post("/api/bulk-messaging/send", requirePhysician, async (req, res) => {
  try {
    const { targets, message, channel, dryRun } = req.body
    if (!Array.isArray(targets) || !message) {
      res.status(400).json({ ok: false, error: "targets[] and message required" })
      return
    }

    const preview = buildBulkPreview(targets, "send_message", message)
    if (preview.blocked > 0 && !dryRun) {
      res.status(400).json({ ok: false, error: `${preview.blocked} targets are blocked`, preview })
      return
    }

    if (dryRun) {
      res.json({ ok: true, dryRun: true, preview })
      return
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
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Bulk send failed" })
  }
})

router.get("/api/bulk-messaging/jobs", requireStaff, (_req, res) => {
  res.json({ ok: true, jobs: [...sentJobs].reverse() })
})

export default router
