import { Router } from "express"
import { buildBulkPreview, type BulkAction, type BulkTarget } from "../services/bulkActionPreviewService"

const router = Router()

router.post("/api/bulk-action/preview", (req, res) => {
  const { targets, action, messageTemplate } = req.body
  if (!Array.isArray(targets) || !action) {
    return res.status(400).json({ ok: false, error: "targets (array) and action required" })
  }
  const preview = buildBulkPreview(targets as BulkTarget[], action as BulkAction, messageTemplate)
  res.json({ ok: true, preview })
})

export default router
