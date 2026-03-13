import { Router } from "express"
import { getMetrics, resetMetrics } from "../core/monitoring/metrics"
import { readAllEvents } from "../core/events/eventStream"
import { getCacheStats } from "../core/state/clinicalStateCache"

const router = Router()

router.get("/", async (_req, res) => {
  try {
    const metrics = getMetrics()
    const cacheStats = getCacheStats()
    const events = await readAllEvents()
    const uniqueCases = new Set(events.map(e => e.caseId)).size

    res.json({
      ok: true,
      metrics,
      cache: cacheStats,
      eventStream: {
        totalEvents: events.length,
        uniqueCases,
      },
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post("/reset", (_req, res) => {
  resetMetrics()
  res.json({ ok: true, message: "Metrics reset" })
})

router.get("/events/summary", async (_req, res) => {
  try {
    const events = await readAllEvents()
    const byType: Record<string, number> = {}
    const byCase: Record<string, number> = {}

    for (const e of events) {
      byType[e.type] = (byType[e.type] ?? 0) + 1
      byCase[e.caseId] = (byCase[e.caseId] ?? 0) + 1
    }

    res.json({
      ok: true,
      totalEvents: events.length,
      uniqueCases: Object.keys(byCase).length,
      eventsByType: byType,
      eventsByCase: byCase,
    })
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
